import { ToolCallAggregator, extractToolCallsFromDelta } from "../tool-use"
import type OpenAI from "openai"

function deltaToolCall(id: string, name: string, argsChunk: string, index?: number): OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta {
  return {
    tool_calls: [{ id, index, type: "function", function: { name, arguments: argsChunk } }] as any,
  } as any
}

describe("ToolCallAggregator", () => {
  test("single complete tool call in one chunk", () => {
    const agg = new ToolCallAggregator()
    const out = agg.addFromDelta(deltaToolCall("a", "sum", `{"x":1,"y":2}`))
    expect(out).toHaveLength(1)
    expect(out[0].complete).toBe(true)
    expect(out[0].name).toBe("sum")
    expect(out[0].parsedArgs).toEqual({ x: 1, y: 2 })
  })

  test("arguments split across multiple chunks", () => {
    const agg = new ToolCallAggregator()
    expect(agg.addFromDelta(deltaToolCall("a", "sum", `{"x":1,`))).toHaveLength(0)
    const out = agg.addFromDelta(deltaToolCall("a", "sum", `"y":2}`))
    expect(out).toHaveLength(1)
    expect(out[0].complete).toBe(true)
    expect(out[0].argString).toBe(`{"x":1,"y":2}`)
    expect(out[0].parsedArgs).toEqual({ x: 1, y: 2 })
  })

  test("multiple parallel tool calls with indices", () => {
    const agg = new ToolCallAggregator()
    const out1 = agg.addFromDelta(deltaToolCall("a", "one", `{"a":1}`, 0))
    const out2 = agg.addFromDelta(deltaToolCall("b", "two", `{"b":2}`, 1))
    
    expect(out1).toHaveLength(1)
    expect(out1[0].name).toBe("one")
    expect(out1[0].index).toBe(0)
    
    expect(out2).toHaveLength(1)
    expect(out2[0].name).toBe("two")
    expect(out2[0].index).toBe(1)
  })

  test("malformed json never completes but finalizes", () => {
    const agg = new ToolCallAggregator()
    agg.addFromDelta(deltaToolCall("a", "bad", `{"x":1`))
    const flushed = agg.finalize()
    expect(flushed).toHaveLength(1)
    expect(flushed[0].complete).toBe(false) // still malformed; finalize doesn't force completion
    expect(flushed[0].argString).toBe(`{"x":1`)
    expect(flushed[0].parsedArgs).toBeUndefined()
  })

  test("maxArgBytes safety cap", () => {
    const agg = new ToolCallAggregator({ maxArgBytes: 8 })
    const out = agg.addFromDelta(deltaToolCall("a", "sum", `{"x":123456}`))
    expect(out).toHaveLength(1)
    expect(out[0].limited).toBe(true)
    expect(out[0].complete).toBe(true)
    expect(out[0].parsedArgs).toBeUndefined() // too long, not parsed
  })

  test("reset clears all accumulated state", () => {
    const agg = new ToolCallAggregator()
    agg.addFromDelta(deltaToolCall("a", "sum", `{"x":1`))
    agg.reset()
    const flushed = agg.finalize()
    expect(flushed).toHaveLength(0)
  })

  test("parse attempts tracking", () => {
    const agg = new ToolCallAggregator()
    agg.addFromDelta(deltaToolCall("a", "sum", `{`))
    agg.addFromDelta(deltaToolCall("a", "sum", `"x"`))
    agg.addFromDelta(deltaToolCall("a", "sum", `:`))
    const out = agg.addFromDelta(deltaToolCall("a", "sum", `1}`))
    
    expect(out).toHaveLength(1)
    expect(out[0].parseAttempts).toBe(4)
  })

  test("handles tool calls without explicit id using generated ids", () => {
    const agg = new ToolCallAggregator()
    // Without explicit IDs, the system generates them based on name and timestamp
    const delta1 = { tool_calls: [{ type: "function", function: { name: "test1", arguments: `{"a":1}` }, index: 0 }] } as any
    const delta2 = { tool_calls: [{ type: "function", function: { name: "test2", arguments: `{"b":2}` }, index: 1 }] } as any
    
    const out1 = agg.addFromDelta(delta1)
    const out2 = agg.addFromDelta(delta2)
    
    expect(out1).toHaveLength(1)
    expect(out2).toHaveLength(1)
    expect(out1[0].name).toBe("test1")
    expect(out2[0].name).toBe("test2")
    expect(out1[0].parsedArgs).toEqual({ a: 1 })
    expect(out2[0].parsedArgs).toEqual({ b: 2 })
  })

  test("accumulates chunks for same tool call without id", () => {
    const agg = new ToolCallAggregator()
    // Without ID, same name and index should accumulate
    const delta1 = { tool_calls: [{ type: "function", function: { name: "test", arguments: `{"a":` }, index: 0 }] } as any
    const delta2 = { tool_calls: [{ type: "function", function: { name: "test", arguments: `1}` }, index: 0 }] } as any
    
    const out1 = agg.addFromDelta(delta1)
    expect(out1).toHaveLength(0) // Not complete yet
    
    const out2 = agg.addFromDelta(delta2)
    expect(out2).toHaveLength(1) // Now complete
    expect(out2[0].argString).toBe(`{"a":1}`)
    expect(out2[0].parsedArgs).toEqual({ a: 1 })
  })
})

describe("extractToolCallsFromDelta", () => {
  test("extracts standard OpenAI tool calls", () => {
    const delta = {
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "test", arguments: `{"x":1}` } }
      ]
    }
    const calls = extractToolCallsFromDelta(delta)
    expect(calls).toHaveLength(1)
    expect(calls[0].id).toBe("call_1")
    expect(calls[0].function.name).toBe("test")
  })

  test("extracts XML tool calls from content", () => {
    const delta = {
      content: `<search><query>test query</query><limit>10</limit></search>`
    }
    const calls = extractToolCallsFromDelta(delta)
    expect(calls).toHaveLength(1)
    expect(calls[0].function.name).toBe("search")
    const args = JSON.parse(calls[0].function.arguments)
    expect(args.query).toBe("test query")
    expect(args.limit).toBe(10)
  })

  test("extracts JSON tool_use from content", () => {
    const delta = {
      content: `Here's the result: {"type":"tool_use","name":"calculate","id":"calc_1","input":{"x":5,"y":3}}`
    }
    const calls = extractToolCallsFromDelta(delta)
    expect(calls).toHaveLength(1)
    expect(calls[0].id).toBe("calc_1")
    expect(calls[0].function.name).toBe("calculate")
    const args = JSON.parse(calls[0].function.arguments)
    expect(args.x).toBe(5)
    expect(args.y).toBe(3)
  })

  test("handles multiple JSON tool_use blocks in content", () => {
    const delta = {
      content: `First: {"type":"tool_use","name":"tool1","input":{"a":1}} and second: {"type":"tool_use","name":"tool2","input":{"b":2}}`
    }
    const calls = extractToolCallsFromDelta(delta)
    expect(calls).toHaveLength(2)
    expect(calls[0].function.name).toBe("tool1")
    expect(calls[1].function.name).toBe("tool2")
  })

  test("ignores reserved XML tags", () => {
    const delta = {
      content: `<think>internal thought</think><tool_result>old result</tool_result><search><query>real tool</query></search>`
    }
    const calls = extractToolCallsFromDelta(delta)
    expect(calls).toHaveLength(1)
    expect(calls[0].function.name).toBe("search")
  })
})