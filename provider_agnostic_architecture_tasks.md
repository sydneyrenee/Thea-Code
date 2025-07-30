# Provider-Agnostic Architecture Implementation Tasks

*Updated: July 30, 2025*

This document provides a comprehensive task list for the Thea Code project's transition to a provider-agnostic architecture. It builds upon previous work and documentation, incorporating the latest status and priorities.

## ✅ Completed Tasks

1. **Model Capability Detection System**
   - Created `model-capabilities.ts` utility module with property-based capability detection
   - Created `model-pattern-detection.ts` for pattern-based capability detection
   - Added comprehensive documentation in `capability-detection-system.md`
   - Implemented capability detection functions for computer use, prompt caching, images, thinking, and temperature
   - Added helper functions for getting model parameters based on capabilities
   - Created comprehensive test suite for capability detection functions

2. **Provider Updates**
   - Updated `anthropic.ts` to use capability detection instead of hardcoded model checks
   - Updated `openrouter.ts` to use capability detection for model features
   - Updated `glama.ts` to use capability detection instead of hardcoded model checks
   - Updated `vertex.ts` to use capability detection and neutral types
   - Updated `unbound.ts` to use capability detection for temperature support
   - Updated `openai.ts` to use capability detection for thinking and image support

3. **Neutral Client Implementation**
   - Implemented `NeutralAnthropicClient` class with fetch-based API calls
   - Implemented `NeutralVertexClient` class with fetch-based API calls
   - Created neutral type definitions to replace SDK-specific types
   - Implemented fetch-based token counting in neutral clients
   - Updated core modules to use neutral interfaces

4. **SDK Dependency Removal (Partial)**
   - Removed `@anthropic-ai/vertex-sdk` from package.json
   - Removed SDK import from `types.ts`
   - Replaced Anthropic SDK with fetch-based implementation in `NeutralAnthropicClient.ts`
   - Replaced Vertex SDK with fetch-based implementation in `NeutralVertexClient.ts`

5. **Type Safety Improvements (Partial)**
   - Added proper type definitions in `UnifiedMcpToolSystem.test.ts`
   - Added type annotations for event handlers in `ProviderIntegration.ts`
   - Implemented type guards for EventEmitter instances
   - Added proper type definitions for API responses in neutral clients

6. **Promise Handling Improvements (Partial)**
   - Fixed promise handling in `PerformanceValidation.test.ts`
   - Properly awaited async operations in `ProviderTransportIntegration.test.ts`
   - Fixed promise handling in `MockMcpProvider.test.ts`
   - Added proper error handling for async operations

7. **MCP XML Format Conversion**
   - Implemented proper content type handling with type guards
   - Added comprehensive XML escaping for all special characters
   - Enhanced error handling for unrecognized content types
   - Added extensive test coverage for all content types

8. **Documentation**
   - Created `capability-detection-system.md` explaining the capability detection system
   - Created `implementation_update.md` documenting changes to `unbound.ts` and `useOpenRouterModelProviders.ts`
   - Created `neutral_vertex_client_implementation_plan.md` outlining the implementation plan
   - Created `neutral_vertex_client_implementation_summary.md` documenting the implementation
   - Created `mcp_xml_conversion_improvements.md` documenting MCP XML format conversion improvements
   - Created `test-improvements.md` documenting test infrastructure improvements

## 🔄 Remaining Tasks

### 1. Complete UI Component Updates (High Priority)

- [ ] **Update UI components to use capability detection**
  - [ ] Update `webview-ui/src/components/ui/hooks/useOpenRouterModelProviders.ts` to fully use capability detection
  - [ ] Update model selection UI to display capabilities rather than model-specific features
  - [ ] Implement capability-based UI adaptations
  - [ ] Create a unified capability detection API for frontend components

- [ ] **Implement dynamic feature toggles**
  - [ ] Create capability-aware UI components
  - [ ] Implement dynamic feature toggles based on selected model
  - [ ] Add tooltips and guidance for capability-specific features

### 2. Fix Failing Tests (High Priority)

- [ ] **Address the 121 failing tests**
  - [ ] Investigate and fix "ENOENT" errors in `loadRuleFiles` test
  - [ ] Fix MCP-related test failures
  - [ ] Update tests to use neutral client mocks instead of SDK mocks
  - [ ] Add integration tests for tool use routing through MCP

- [ ] **Enhance test coverage**
  - [ ] Add tests for neutral format conversions
  - [ ] Create tests for provider-agnostic model capability detection
  - [ ] Add tests for error handling in async operations
  - [ ] Add performance tests for large response handling

### 3. Complete SDK Dependency Removal (Medium Priority)

- [ ] **Remove remaining direct SDK dependencies from package.json**
  - [ ] Remove `@anthropic-ai/sdk`
  - [ ] Remove `@anthropic-ai/bedrock-sdk`
  - [ ] Update package-lock.json

- [ ] **Update exports and imports**
  - [ ] Ensure neutral clients are properly exported from their respective modules
  - [ ] Update all imports to use neutral interfaces instead of SDK types
  - [ ] Remove unused imports across the codebase

- [ ] **Update core modules with direct SDK dependencies**
  - [ ] Update `src/api/index.ts` to remove `BetaThinkingConfigParam` import
  - [ ] Update `src/core/webview/history/TheaTaskHistory.ts` to remove direct SDK imports
  - [ ] Update `src/core/tools/attemptCompletionTool.ts` to use neutral content types

### 4. Fix Remaining Type Safety Issues (Medium Priority)

- [ ] **Address remaining unsafe `any` usage in MCP implementation**
  - [ ] Fix type issues in `src/services/mcp/core/McpToolRouter.ts`
  - [ ] Improve type definitions in `src/services/mcp/core/McpToolExecutor.ts`
  - [ ] Add proper type guards for remaining untyped functions
  - [ ] Replace `@ts-expect-error` comments with proper type assertions

- [ ] **Enhance neutral client type safety**
  - [ ] Complete remaining type safety improvements in neutral clients
  - [ ] Add proper type definitions for streaming response handling
  - [ ] Implement stricter type checking for API parameters

- [ ] **Address linting errors**
  - [ ] Fix the 75 linting errors identified in lint-output.log
  - [ ] Prioritize type safety issues in the MCP implementation
  - [ ] Add proper type definitions for tool use formats and responses

### 5. Fix Remaining Promise Handling (Medium Priority)

- [ ] **Resolve floating promises in remaining test files**
  - [ ] Address any remaining async issues in integration tests
  - [ ] Ensure all async functions properly await their promises
  - [ ] Add proper error handling for all async operations

- [ ] **Improve async/await implementation**
  - [ ] Add proper error handling for async operations
  - [ ] Ensure consistent promise handling patterns across the codebase
  - [ ] Add timeout handling for long-running async operations

### 6. Implement Additional Neutral Clients (Low Priority)

- [ ] **Implement NeutralGeminiClient**
  - [ ] Create a fetch-based implementation for Gemini models
  - [ ] Remove dependency on `@google-cloud/vertexai`
  - [ ] Update `vertex.ts` to use the new client for Gemini models

- [ ] **Implement NeutralBedrockClient**
  - [ ] Create a fetch-based implementation for AWS Bedrock
  - [ ] Remove dependency on AWS SDK
  - [ ] Update `bedrock.ts` to use the new client

### 7. Performance Optimization (Low Priority)

- [ ] **Stream processing optimization**
  - [ ] Review and optimize stream processing in fetch-based implementations
  - [ ] Implement efficient chunk handling for large responses
  - [ ] Add progress indicators for long-running operations

- [ ] **Caching improvements**
  - [ ] Optimize prompt caching based on model capabilities
  - [ ] Implement intelligent cache invalidation strategies
  - [ ] Add metrics for cache hit/miss rates

### 8. Documentation Updates (Low Priority)

- [ ] **Update architectural documentation**
  - [ ] Document the neutral client architecture
  - [ ] Update MCP integration documentation
  - [ ] Create migration guide for contributors

- [ ] **Add code comments**
  - [ ] Document complex type conversions
  - [ ] Add explanatory comments for model capability detection
  - [ ] Document provider-specific handling in neutral format

## Current Project Status

The project has made significant progress in implementing a provider-agnostic architecture:

1. **Model Capability Detection**: A robust system for detecting model capabilities based on properties rather than hardcoded model checks has been implemented and is being used across multiple provider files.

2. **Neutral Client Implementation**: Two major neutral clients have been implemented (`NeutralAnthropicClient` and `NeutralVertexClient`), replacing direct SDK dependencies with fetch-based implementations.

3. **SDK Dependency Removal**: Several SDK dependencies have been removed, including `@anthropic-ai/vertex-sdk`, reducing the project's external dependencies.

4. **Type Safety and Promise Handling**: Significant improvements have been made to type safety and promise handling, particularly in the MCP implementation and test files.

5. **MCP XML Format Conversion**: The XML format conversion has been improved with proper content type handling, type guards, XML escaping, and comprehensive test coverage.

## Implementation Priority Order

1. **High Priority**: Complete UI component updates to use capability detection
2. **High Priority**: Fix failing tests, focusing on MCP-related failures
3. **Medium Priority**: Complete SDK dependency removal from core modules
4. **Medium Priority**: Address remaining type safety issues in MCP implementation
5. **Medium Priority**: Fix promise handling in remaining test files
6. **Low Priority**: Implement additional neutral clients
7. **Low Priority**: Optimize performance for stream processing and caching
8. **Low Priority**: Update documentation and add code comments

## Expected Benefits

Completing these tasks will:

1. **Reduced Dependencies**: Eliminate reliance on specific vendor SDKs, making the codebase more maintainable
2. **Improved Flexibility**: Allow easier integration of new AI providers without major code changes
3. **Enhanced Type Safety**: Reduce runtime errors through better type checking and validation
4. **Better Testing**: Simplify testing with consistent interfaces and better mocking capabilities
5. **Improved Performance**: Optimize resource usage with capability-based feature activation
6. **Better Developer Experience**: Provide clear documentation and consistent patterns for contributors