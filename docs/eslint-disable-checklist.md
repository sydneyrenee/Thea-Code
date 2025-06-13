# ESLint Disable Checklist

This document lists all files in the codebase that use ESLint disable comments, particularly focusing on broad disables that hide errors. The goal is to properly fix the underlying issues and remove these broad disables.

## Files with Complete ESLint Disables

These files completely disable ESLint with `/* eslint-disable */`:

1. [x] `/Volumes/stuff/Projects/Thea-Code/src/services/mcp/client/SseClientFactory.ts` - Fixed by adding proper type imports and specific ESLint disables
2. [x] `/Volumes/stuff/Projects/Thea-Code/src/services/mcp/core/__tests__/McpToolExecutor.test.ts` - Fixed by adding specific ESLint disables for test-specific issues
3. [x] `/Volumes/stuff/Projects/Thea-Code/src/services/mcp/core/__tests__/McpToolRouter.test.ts` - Fixed by adding specific ESLint disables for test-specific issues

## Files with Broad TypeScript ESLint Disables

These files disable multiple TypeScript-related ESLint rules at once:

1. [ ] `/Volumes/stuff/Projects/Thea-Code/src/api/providers/__tests__/ollama.test.ts`
   - Disables: `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-call`, `@typescript-eslint/no-unsafe-member-access`, `@typescript-eslint/no-unsafe-return`

2. [ ] `/Volumes/stuff/Projects/Thea-Code/src/api/providers/__tests__/openai-native.test.ts`
   - Disables: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-call`, `@typescript-eslint/no-unsafe-assignment`

3. [ ] `/Volumes/stuff/Projects/Thea-Code/src/api/providers/__tests__/openai-usage-tracking.test.ts`
   - Disables: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-call`, `@typescript-eslint/no-unsafe-assignment`

4. [ ] `/Volumes/stuff/Projects/Thea-Code/src/api/providers/__tests__/openai.test.ts`
   - Disables: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-call`, `@typescript-eslint/no-unsafe-assignment`

5. [ ] `/Volumes/stuff/Projects/Thea-Code/src/core/config/__tests__/CustomModesManager.test.ts`
   - Disables: `@typescript-eslint/require-await`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-argument`, `@typescript-eslint/no-unsafe-member-access`, `@typescript-eslint/no-unsafe-call`, `@typescript-eslint/unbound-method`

6. [ ] `/Volumes/stuff/Projects/Thea-Code/src/core/config/__tests__/ContextProxy.test.ts`
   - Disables: `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-member-access`

7. [ ] `/Volumes/stuff/Projects/Thea-Code/src/core/config/__tests__/importExport.test.ts`
   - Disables: `@typescript-eslint/unbound-method`, `@typescript-eslint/no-unsafe-assignment`

8. [ ] `/Volumes/stuff/Projects/Thea-Code/src/core/webview/__tests__/TheaMcpManager.test.ts`
   - Disables: `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-return`, `@typescript-eslint/no-unsafe-call`

9. [ ] `/Volumes/stuff/Projects/Thea-Code/src/core/webview/__tests__/TheaProvider.test.ts`
   - Disables: `@typescript-eslint/no-unsafe-return`, `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-call`

10. [ ] `/Volumes/stuff/Projects/Thea-Code/src/api/transform/__tests__/gemini-format.test.ts`
    - Disables: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-assignment`

11. [ ] `/Volumes/stuff/Projects/Thea-Code/src/api/transform/__tests__/openai-format.test.ts`
    - Disables: `@typescript-eslint/no-unsafe-argument`

12. [ ] `/Volumes/stuff/Projects/Thea-Code/src/services/mcp/__tests__/UnifiedMcpToolSystem.test.ts`
    - Disables: `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-call`

13. [ ] `/Volumes/stuff/Projects/Thea-Code/src/services/mcp/__tests__/formats/OpenAIFunctionFormat.test.ts`
    - Disables: `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-argument`

14. [ ] `/Volumes/stuff/Projects/Thea-Code/src/services/mcp/__tests__/performance/PerformanceValidation.test.ts`
    - Disables: `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-unsafe-assignment`

15. [ ] `/Volumes/stuff/Projects/Thea-Code/src/services/mcp/client/__tests__/SseClientFactory.test.ts`
    - Disables: `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-unsafe-assignment`

16. [ ] `/Volumes/stuff/Projects/Thea-Code/src/services/mcp/integration/__tests__/ProviderTransportIntegration.test.ts`
    - Disables: `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/require-await`

17. [ ] `/Volumes/stuff/Projects/Thea-Code/src/services/mcp/management/McpHub.ts`
    - Disables: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-assignment`

18. [ ] `/Volumes/stuff/Projects/Thea-Code/src/services/mcp/providers/__tests__/MockMcpProvider.test.ts`
    - Disables: `@typescript-eslint/no-unused-vars`, `@typescript-eslint/require-await`

19. [ ] `/Volumes/stuff/Projects/Thea-Code/src/utils/__tests__/json-xml-bridge.test.ts`
    - Disables: `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-member-access`

20. [ ] `/Volumes/stuff/Projects/Thea-Code/src/utils/__tests__/shell.test.ts`
    - Disables: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-return`

21. [ ] `/Volumes/stuff/Projects/Thea-Code/src/utils/json-xml-bridge.ts`
    - Disables: `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-member-access`

## Approach to Fixing

For each file, we will:

1. Analyze why ESLint rules were disabled
2. Research proper fixes for the issues
3. Implement fixes to properly address the underlying issues
4. Remove the broad ESLint disables
5. Verify that the code works correctly after fixes

## Progress Tracking

- [x] Files with complete ESLint disables fixed: 3/3
- [ ] Files with broad TypeScript ESLint disables fixed: 0/21
- [x] Total files fixed: 3/24

## Notes on Common Issues and Solutions

### Common Issues

1. **Type Safety in Test Files**
   - Test files often need to access private properties and mock objects, which can trigger TypeScript ESLint rules
   - For test files, it's acceptable to use specific ESLint disable comments for test-specific issues
   - Common rules to disable in test files: `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-explicit-any`, `require-await`, `no-unused-vars`, `unbound-method`

2. **Dynamic Imports vs. require()**
   - Replace `require()` calls with dynamic imports using `await import()`
   - Add proper type assertions for imported modules
   - Example:

   Before:
   ```
   const { Client } = require("@modelcontextprotocol/sdk/client")
   ```

   After:
   ```
   const { Client } = await import("@modelcontextprotocol/sdk/client/index.js") as { Client: typeof SdkClient }
   ```

3. **Unused Parameters in Interface Implementations**
   - When implementing an interface, sometimes parameters are required but not used
   - Use specific ESLint disable comments for these parameters
   - Example:

   ```
   methodName(
     // eslint-disable-next-line @typescript-eslint/no-unused-vars
     unusedParam: string
   ): void {
     // Implementation
   }
   ```

4. **Async Methods with No Await**
   - Methods that return a Promise but don't use await internally
   - Either make them non-async and return Promise directly, or add specific ESLint disable comments
   - Example:

   Before:
   ```
   async methodName(): Promise<Result> {
     return someValue;
   }
   ```

   After:
   ```
   methodName(): Promise<Result> {
     return Promise.resolve(someValue);
   }
   ```
