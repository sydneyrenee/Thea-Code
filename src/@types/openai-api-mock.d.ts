declare module 'openai-api-mock' {
  interface MockResponse {
    stopMocking(): void;
  }
  export function mockOpenAIResponse(config: unknown): MockResponse;
}
