# Architectural Audit Notes: API Handler (`src/api/index.ts`)

**Date:** 2025-05-04

**Objective:** Analyze the structure and interface for interacting with different AI model providers.

**Key Findings:**

1.  **Common Interface (`ApiHandler`):**

    - Defines a standard interface (`ApiHandler`) that all provider-specific handlers must implement.
    - Located in `src/api/index.ts`.
    - Key methods: `createMessage`, `getModel`, `countTokens`.

2.  **Anthropic-Centric Design:**

    - The `ApiHandler` interface methods, specifically `createMessage` and `countTokens`, explicitly use types imported from the Anthropic SDK (`Anthropic.Messages.MessageParam`, `Anthropic.Messages.ContentBlockParam`).
    - **Conclusion:** This forces the core application logic (`TheaTask`) and all non-Anthropic provider handlers to conform to Anthropic's specific message structure.

3.  **Provider Implementations:**

    - Specific handlers for various providers (OpenAI, Gemini, Ollama, etc.) are imported from the `src/api/providers/` directory.
    - Each handler must implement the `ApiHandler` interface.
    - **Implication:** Non-Anthropic handlers (`OpenAiHandler`, `GeminiHandler`, etc.) are required to perform internal translation:
        - **Input:** Convert the received Anthropic-formatted message history into their native API format.
        - **Output:** Convert their native API response back into the Anthropic-like streaming format expected by `ApiStream`.

4.  **Factory Function (`buildApiHandler`):**
    - Acts as a factory using a Strategy Pattern.
    - Selects and instantiates the appropriate provider-specific handler based on the `apiProvider` field in the `ApiConfiguration`.

**Architectural Implications:**

- The current design tightly couples the core application to Anthropic's API structure, hindering portability and potentially impacting the performance/accuracy of other models.
- This confirms the need for the proposed "Neutral History & Adapters" architecture to decouple the application from specific provider formats.

**Next Step:**

- Examine a specific non-Anthropic provider implementation (e.g., `OpenAiHandler`) to understand the current translation mechanism in practice.
