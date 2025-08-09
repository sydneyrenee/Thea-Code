import { NeutralVertexClient } from "../services/vertex/NeutralVertexClient";
import type {
  NeutralVertexClaudeResponse,
  NeutralVertexGeminiResponse,
} from "../services/vertex/types";
import type { NeutralMessageContent } from "../shared/neutral-history";

// Mock google-auth-library to avoid real GCP auth, keep shapes minimal but correct
jest.mock("google-auth-library", () => ({
  GoogleAuth: class {
    getClient() {
      return Promise.resolve({
        getAccessToken: () =>
          Promise.resolve({
            token: "test-token",
            res: { data: { expiry_date: Date.now() + 60 * 60 * 1000 } },
          }),
      });
    }
  },
}));

// Mock tiktoken lite to keep token counting predictable/lightweight in tests
jest.mock(
  "js-tiktoken/lite",
  () =>
    ({
      Tiktoken: class {
        static specialTokenRegex = /<\|[^|]+\|>/g;
        // Accept config arg for compatibility with real constructor
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        constructor(_config?: unknown) {}
        encode(text: string): number[] {
          return text.split(/\s+/).filter(Boolean).map((_, i) => i);
        }
      },
    } as unknown)
);

// Mock the o200k_base ranks (constructor arg); we don't need real data
jest.mock("js-tiktoken/ranks/o200k_base", () => ({}));

describe("NeutralVertexClient", () => {
  const projectId = "proj-123";
  const region = "us-central1";

  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default ok response; specific tests will override with mockResolvedValueOnce
    fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ content: [{ type: "text", text: "ok" }] satisfies NeutralVertexClaudeResponse["content"] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        ) as unknown as Response
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const makeClient = () => new NeutralVertexClient({ projectId, region });

  it("completeClaudePrompt returns text and calls correct endpoint with auth", async () => {
    const client = makeClient();
    const model = "claude-3-5-sonnet@20240620";

    const payload: NeutralVertexClaudeResponse = {
      content: [{ type: "text", text: "Hello Claude" }],
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as unknown as Response
    );

    const text = await client.completeClaudePrompt("Hi", model, 42, 0.1);
    expect(text).toBe("Hello Claude");

    // Verify URL and headers/body
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [url, init] = fetchSpy.mock.calls[0] as [string, { headers?: Record<string, string>; body?: string }];
    expect(url).toBe(
      `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/anthropic/models/${model}:generateContent`
    );
    const headers = init.headers ?? {};
    expect(headers["Authorization"]).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");

    type ClaudeRequestBody = {
      model: string;
      max_tokens?: number;
      temperature?: number;
      system?: unknown;
      messages?: unknown;
      stream: boolean;
    };
    const parsed: unknown = JSON.parse(init.body ?? "{}");
    const isClaudeRequest = (v: unknown): v is ClaudeRequestBody =>
      typeof v === "object" && v !== null &&
      typeof (v as Record<string, unknown>).model === "string" &&
      typeof (v as Record<string, unknown>).stream === "boolean";
    expect(isClaudeRequest(parsed)).toBe(true);
    if (isClaudeRequest(parsed)) {
      expect(parsed.stream).toBe(false);
      expect(parsed.model).toBe(model);
      expect(parsed.max_tokens).toBe(42);
      expect(parsed.temperature).toBe(0.1);
    }
  });

  it("completeGeminiPrompt concatenates text parts and hits correct endpoint", async () => {
    const client = makeClient();
    const model = "gemini-1.5-pro";

    const payload: NeutralVertexGeminiResponse = {
      candidates: [
        {
          content: { parts: [{ text: "Hello " }, { text: "Gemini" }] },
        },
      ],
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as unknown as Response
    );

    const text = await client.completeGeminiPrompt("Hi", model, 128, 0.2);
    expect(text).toBe("Hello Gemini");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [url, init] = fetchSpy.mock.calls[0] as [string, { body?: string }];
    expect(url).toBe(
      `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:generateContent`
    );
    type GeminiRequestBody = {
      model: string;
      contents?: unknown;
      generationConfig?: { maxOutputTokens?: number; temperature?: number };
      systemInstruction?: unknown;
      stream: boolean;
    };
    const parsed: unknown = JSON.parse(init.body ?? "{}");
    const isGeminiRequest = (v: unknown): v is GeminiRequestBody =>
      typeof v === "object" && v !== null &&
      typeof (v as Record<string, unknown>).model === "string" &&
      typeof (v as Record<string, unknown>).stream === "boolean";
    expect(isGeminiRequest(parsed)).toBe(true);
    if (isGeminiRequest(parsed)) {
      expect(parsed.stream).toBe(false);
      expect(parsed.model).toBe(model);
      expect(parsed.generationConfig?.maxOutputTokens).toBe(128);
      expect(parsed.generationConfig?.temperature).toBe(0.2);
    }
  });

  it("countTokens counts only text blocks", () => {
    const client = makeClient();
    const content1: NeutralMessageContent = [{ type: "text", text: "one two three" }];
    const content2: NeutralMessageContent = [
      { type: "text", text: "alpha beta gamma" },
      { type: "text", text: "delta" },
    ];
    const count1 = client.countTokens("any", content1);
    const count2 = client.countTokens("any", content2);
    expect(count1).toBeGreaterThan(0);
    expect(count2).toBeGreaterThan(count1);
  });

  it("completeClaudePrompt throws on HTTP error with status in message", async () => {
    const client = makeClient();
    const model = "claude-3-5-sonnet@20240620";

    fetchSpy.mockResolvedValueOnce(new Response("Server error", { status: 500 }) as unknown as Response);

    await expect(client.completeClaudePrompt("Hi", model)).rejects.toThrow(
      /Vertex AI Claude API error: 500/
    );
  });

  it("completeGeminiPrompt throws on HTTP error with status in message", async () => {
    const client = makeClient();
    const model = "gemini-1.5-pro";

    fetchSpy.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }) as unknown as Response);

    await expect(client.completeGeminiPrompt("Hi", model)).rejects.toThrow(
      /Vertex AI Gemini API error: 403/
    );
  });
});
