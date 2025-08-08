import type OpenAI from "openai"

export type ToolCall = {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
  // Optional index to preserve ordering from providers that send it
  index?: number
}

function toStringifiedArgs(arg: unknown): string {
  // OpenAI expects a JSON-encoded string. Be permissive with streamed/partial values.
  if (arg === undefined) return "{}"          // best-effort default when missing
  if (arg === null) return "null"             // preserve null
  if (typeof arg === "string") {
    const s = arg.trim()
    // If it already looks like JSON, pass through. Do not force-wrap to avoid double-encoding.
    if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) return s
    // If it parses as JSON, pass through unchanged.
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(s)
      if (parsed !== undefined) return s
    } catch {
      /* fallthrough */
    }
    return s
  }
  if (typeof arg === "number" || typeof arg === "boolean") return JSON.stringify(arg)
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg)
    } catch {
      return "{}"
    }
  }
  return "{}"
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function normalizeStandardToolCalls(arr: unknown[]): ToolCall[] {
  const out: ToolCall[] = []
  for (const vUnknown of arr) {
    const v = vUnknown as Record<string, unknown>
    const fn = v.function as Record<string, unknown> | undefined
    const name = (fn?.name as string) || undefined
    if (!name) continue
    const idVal = v.id
    const id = typeof idVal === "string" && idVal.length > 0 ? idVal : `${name}-${Date.now()}`
    const index = typeof (v as { index?: unknown }).index === "number" ? ((v as { index?: number }).index as number) : undefined
    // function.arguments may be string | object | number | boolean | undefined in streamed deltas
    const args = toStringifiedArgs((fn as { arguments?: unknown } | undefined)?.arguments)
    out.push({ id, type: "function", function: { name, arguments: args }, index })
  }
  return out
}

// Parse <tool>...</tool> XML blocks excluding think/tool_result/tool_use
function extractXmlToolCalls(content: string): ToolCall[] {
  const toolCalls: ToolCall[] = []
  const xmlToolUseRegex = /<([A-Za-z_][\w-]*)>[\s\S]*?<\/\1>/g
  let match: RegExpExecArray | null

  while ((match = xmlToolUseRegex.exec(content)) !== null) {
    const tagName = match[1]
    if (tagName === "think" || tagName === "tool_result" || tagName === "tool_use") continue
    const toolUseXml = match[0]

    try {
      // Remove outer tool tag
      let inner = toolUseXml.replace(new RegExp(`<${tagName}>\\s*`), "")
      inner = inner.replace(new RegExp(`\\s*</${tagName}>`), "")

      // Parse parameters (shallow)
      const params: Record<string, unknown> = {}
      const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
      let p: RegExpExecArray | null
      while ((p = paramRegex.exec(inner)) !== null) {
        const name = p[1]
        const raw = decodeXmlEntities(p[2].trim())
        if (name === tagName) continue
        try {
          params[name] = JSON.parse(raw)
        } catch {
          // Coerce common primitives, otherwise keep string
          if (/^-?\d+(\.\d+)?$/.test(raw)) {
            params[name] = Number(raw)
          } else if (raw === "true" || raw === "false") {
            params[name] = raw === "true"
          } else {
            params[name] = raw
          }
        }
      }

      toolCalls.push({
        id: `${tagName}-${Date.now()}`,
        type: "function",
        function: { name: tagName, arguments: JSON.stringify(params) },
      })
    } catch {
      // ignore malformed blocks
    }
  }
  return toolCalls
}

// Parse one or more {"type":"tool_use", ...} JSON blocks from content
function extractJsonToolCalls(content: string): ToolCall[] {
  const toolCalls: ToolCall[] = []
  let pos = 0
  while (true) {
    const idx = content.indexOf('"type":"tool_use"', pos)
    if (idx === -1) break

    // Walk backwards to the preceding '{'
    let start = idx
    while (start >= 0 && content[start] !== '{') start--
    if (start < 0) { pos = idx + 1; continue }

    // Find matching closing brace from start
    let depth = 0
    let inString = false
    let end = -1
    const isEscaped = (i: number) => {
      let slashCount = 0
      for (let j = i - 1; j >= 0 && content[j] === "\\"; j--) slashCount++
      return (slashCount & 1) === 1
    }
    for (let i = start; i < content.length; i++) {
      const ch = content[i]
      if (ch === '"' && !isEscaped(i)) inString = !inString
      else if (!inString) {
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) { end = i + 1; break }
        }
      }
    }

    if (end === -1) { pos = idx + 1; continue }

    try {
      const obj = JSON.parse(content.substring(start, end)) as { type?: string; name?: string; id?: string; input?: unknown; index?: number }
      if (obj?.type === "tool_use" && obj.name) {
        toolCalls.push({
          id: obj.id || `${obj.name}-${Date.now()}`,
          type: "function",
          function: { name: obj.name, arguments: toStringifiedArgs(obj.input ?? {}) },
          index: typeof obj.index === "number" ? obj.index : undefined,
        })
      }
    } catch {
      // ignore
    }

    pos = end
  }
  return toolCalls
}

export function extractToolCallsFromDelta(
  delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta | Record<string, unknown>
): ToolCall[] {
  // Standard OpenAI tool_calls field (may include partial/variant shapes)
  const toolCallsField = (delta as { tool_calls?: unknown }).tool_calls
  if (Array.isArray(toolCallsField)) {
    const normalized = normalizeStandardToolCalls(toolCallsField)
    if (normalized.length > 0) return normalized
  }

  const content = (delta as { content?: unknown }).content
  if (typeof content !== "string") return []

  const xml = extractXmlToolCalls(content)
  if (xml.length > 0) return xml

  return extractJsonToolCalls(content)
}

export function hasToolCalls(delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta): boolean {
  return extractToolCallsFromDelta(delta).length > 0
}

// ---- Aggregation for streaming tool calls ----

export type AggregatedToolCall = {
  id: string
  name: string
  argString: string
  parsedArgs?: unknown
  complete: boolean
  index?: number
  parseAttempts?: number
  limited?: boolean
}

export type ToolCallAggregatorOptions = {
  maxArgBytes?: number // safety cap for arguments accumulation (default 256 KB)
}

export class ToolCallAggregator {
  private byKey = new Map<string, AggregatedToolCall>()
  private readonly maxArgBytes: number

  constructor(opts?: ToolCallAggregatorOptions) {
    this.maxArgBytes = opts?.maxArgBytes ?? 256 * 1024
  }

  private makeKey(id: string, name: string, index?: number): string {
    return id || `${name}:${index ?? "noindex"}`
  }

  addFromDelta(
    delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta | Record<string, unknown>
  ): AggregatedToolCall[] {
    const emitted: AggregatedToolCall[] = []
    const calls = extractToolCallsFromDelta(delta)
    for (const c of calls) {
      const name = c.function.name
      const id = c.id
      const key = this.makeKey(id, name, c.index)
      const chunk = c.function.arguments ?? ""
      const prev = this.byKey.get(key)

      if (!prev) {
        const argString = chunk
        const limited = Buffer.byteLength(argString, "utf8") > this.maxArgBytes
        const trimmed = limited ? this.safeTrim(argString) : argString
        const parsed = limited ? undefined : tryParseJson(trimmed)
        const agg: AggregatedToolCall = {
          id,
          name,
          index: c.index,
          argString: trimmed,
          parsedArgs: parsed,
          complete: limited || isParsableJson(trimmed),
          parseAttempts: 1,
          limited,
        }
        this.byKey.set(key, agg)
        if (agg.complete) emitted.push({ ...agg })
      } else {
        const nextArgString = prev.argString + chunk
        const limited = Buffer.byteLength(nextArgString, "utf8") > this.maxArgBytes
        prev.argString = limited ? this.safeTrim(nextArgString) : nextArgString
        prev.index = prev.index ?? c.index
        prev.parseAttempts = (prev.parseAttempts ?? 0) + 1
        if (limited) {
          prev.limited = true
          if (!prev.complete) {
            prev.complete = true
            prev.parsedArgs = undefined
            emitted.push({ ...prev })
          }
        } else {
          const parsed = tryParseJson(prev.argString)
          if (parsed !== undefined && !prev.complete) {
            prev.parsedArgs = parsed
            prev.complete = true
            emitted.push({ ...prev })
          }
        }
      }
    }
    return emitted
  }

  finalize(): AggregatedToolCall[] {
    const out: AggregatedToolCall[] = []
    for (const agg of this.byKey.values()) {
      if (!agg.complete && !agg.limited) {
        const parsed = tryParseJson(agg.argString)
        if (parsed !== undefined) {
          agg.parsedArgs = parsed
          agg.complete = true
        }
      }
      out.push({ ...agg })
    }
    this.byKey.clear()
    return out
  }

  reset(): void {
    this.byKey.clear()
  }

  private safeTrim(s: string): string {
    // Trim to maxArgBytes boundary without splitting surrogate pairs
    const buf = Buffer.from(s, "utf8")
    const slice = buf.subarray(0, this.maxArgBytes)
    return slice.toString("utf8")
  }
}

function isParsableJson(s: string): boolean {
  try { JSON.parse(s); return true } catch { return false }
}
function tryParseJson(s: string): unknown | undefined {
  try { return JSON.parse(s) } catch { return undefined }
}
