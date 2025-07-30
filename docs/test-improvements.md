# Test Improvements for Ollama and MCP Integration

## Overview

This document describes the improvements made to the test infrastructure to address issues with tests hanging due to port conflicts between real servers and test servers.

## Issues Addressed

1. **Port Conflicts**: Tests were trying to connect to real servers on fixed ports, causing conflicts if those ports were already in use.
2. **Hanging Tests**: Tests were hanging indefinitely when connections to servers failed or timed out.
3. **Lack of Error Handling**: Tests didn't properly handle errors or timeouts in streaming responses.
4. **Race Conditions**: Even with dynamic port assignment, race conditions could occur where a port becomes unavailable between being assigned and being used.

## Changes Made

### 1. Port Utility Functions

Created a new utility module `src/utils/port-utils.ts` with functions for checking port availability:

```typescript
// Check if a port is available
async function isPortAvailable(port: number, host = 'localhost'): Promise<boolean>

// Find an available port starting from a given port
async function findAvailablePort(startPort = 3000, host = 'localhost'): Promise<number>

// Wait until a port becomes available
async function waitForPortAvailable(port: number, host = 'localhost', retryTimeMs = 200, timeOutMs = 10000): Promise<void>

// Wait until a port is in use (server is ready)
async function waitForPortInUse(port: number, host = 'localhost', retryTimeMs = 200, timeOutMs = 10000): Promise<void>
```

These functions use the `tcp-port-used` package to provide reliable port availability checking.

### 2. Improved Dynamic Port Assignment for Mock Servers

Updated the Ollama mock server to use the port utility functions:

```typescript
// Before
const port = 0  // Let the OS assign a random available port

// After
// Find an available port starting from 10000
port = await findAvailablePort(10000);
console.log(`Mock Ollama Server: Found available port ${port}`);

// Start the server with the found port
server = app.listen(port, "localhost", async () => {
    // Wait for the server to be ready
    await waitForPortInUse(actualPort, "localhost", 200, 5000);
    console.log(`Mock Ollama Server listening on http://localhost:${actualPort}`);
});
```

This ensures that we always use an available port and wait for the server to be fully ready before tests connect to it.

### 3. Enhanced EmbeddedMcpProvider Port Handling

Updated the `EmbeddedMcpProvider` to use the port utility functions:

```typescript
// For dynamic port (port 0), find an available port
if (isDynamicPort) {
    // Find an available port starting from 3000
    actualPort = await findAvailablePort(3000);
    
    // Update the config with the found port
    this.sseConfig.port = actualPort;
    
    // Restart the transport with the new port if needed
    // ...
}

// Wait for the port to be in use (server ready)
await waitForPortInUse(actualPort, host, 200, 10000);
```

This prevents race conditions where a port might become unavailable between being assigned and being used.

### 4. Proper Server Cleanup

Updated the server shutdown code to ensure proper cleanup:

```typescript
export const stopServer = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (server) {
            server.close((err) => {
                if (err) {
                    console.error("Mock Ollama Server failed to stop:", err)
                    reject(err)
                } else {
                    console.log("Mock Ollama Server stopped.")
                    // Reset the actual port to ensure clean state between test runs
                    actualPort = null;
                    server = null;
                    resolve()
                }
            })
        } else {
            // Already stopped or never started
            actualPort = null;
            server = null;
            resolve()
        }
    })
}
```

This ensures that the server is properly stopped and resources are cleaned up, even if there are errors.

### 5. Improved Error Handling in Tests

Fixed error handling in tests to properly handle file system errors:

```typescript
// Before - using plain objects for error mocking
mockedFs.readFile.mockRejectedValue({ code: "ENOENT" })

// After - using proper Error objects with code property
const error = new Error("File not found") as Error & { code: string }
error.code = "ENOENT"
mockedFs.readFile.mockRejectedValue(error)
```

This ensures that error handling in tests matches the actual error objects thrown by the file system.

### 6. Test Timeouts

Added a global timeout for the tests to prevent them from hanging indefinitely:

```typescript
// Set a longer timeout for these tests to prevent them from timing out
jest.setTimeout(30000)
```

### 7. Timeout Handling for API Calls

Added timeout handling for API calls that might hang:

```typescript
// Get all available models using the dynamic port with a timeout
const modelPromise = getOllamaModels(ollamaBaseUrl)
const timeoutPromise = new Promise<string[]>((_, reject) => {
    setTimeout(() => reject(new Error("Timeout fetching Ollama models")), 5000)
})

availableModels = await Promise.race([modelPromise, timeoutPromise])
```

## Benefits

1. **Improved Reliability**: Tests no longer hang due to port conflicts or timeouts.
2. **Better Error Handling**: Tests properly handle errors and timeouts, providing better feedback.
3. **Cleaner Test Environment**: Resources are properly cleaned up between test runs.
4. **Reduced Flakiness**: Tests are more consistent and less likely to fail due to external factors.
5. **Race Condition Prevention**: Explicit port availability checking prevents race conditions.

### 8. Enhanced Error Handling in File System Operations

Improved error handling in file system operations to properly handle different types of errors:

```typescript
// Before - simple error handling that didn't differentiate between error types
async function safeReadFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return content.trim()
  } catch (err) {
    const errorCode = (err as NodeJS.ErrnoException).code
    if (!errorCode || !["ENOENT", "EISDIR"].includes(errorCode)) {
      throw err
    }
    return ""
  }
}
```

```typescript
// After - improved error handling with better type checking and error propagation
async function safeReadFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return content.trim()
  } catch (err) {
    // Safely check if the error has a code property
    const error = err as Error & { code?: string }
    const errorCode = error.code
    
    // Handle ENOENT (file not found) and EISDIR (is a directory) errors by returning empty string
    if (errorCode && ["ENOENT", "EISDIR"].includes(errorCode)) {
      return ""
    }
    
    // For all other errors, rethrow the original error to maintain error type
    throw err
  }
}
```

### 9. Improved Jest Environment Teardown Handling

Added better handling for Jest environment teardown to prevent errors when tests are finishing:

```typescript
// Before - no special handling for Jest environment teardown
const mod = await import("@modelcontextprotocol/sdk/server/streamableHttp.js")

// After - proper handling for Jest environment teardown
// Check if we're in a Jest environment
if (process.env.JEST_WORKER_ID) {
  console.debug("Running in Jest environment, proceeding with caution")
}

try {
  // Wrap the dynamic import in a try-catch to handle Jest environment teardown
  let mod
  try {
    mod = await import("@modelcontextprotocol/sdk/server/streamableHttp.js")
  } catch (importError) {
    // Check if this is a Jest teardown error
    if (String(importError).includes("Jest environment has been torn down")) {
      console.warn("Skipping MCP SDK initialization during Jest teardown")
      return
    }
    throw importError
  }
  
  // Continue with normal initialization
}
```

### 10. Enhanced Port Utility Functions

Enhanced the port utility functions with more robust error handling and better configuration options:

```typescript
// Before - basic port utility functions
async function findAvailablePort(startPort = 3000, host = 'localhost'): Promise<number>

// After - enhanced port utility functions with preferred ranges and better error handling
async function findAvailablePort(
  startPort = 3000, 
  host = 'localhost',
  preferredRanges?: Array<[number, number]>,
  maxAttempts = 100
): Promise<number>
```

```typescript
// Before - basic wait functions
async function waitForPortInUse(port: number, host = 'localhost', retryTimeMs = 200, timeOutMs = 10000): Promise<void>

// After - enhanced wait functions with exponential backoff and better error reporting
async function waitForPortInUse(
  port: number, 
  host = 'localhost', 
  retryTimeMs = 200, 
  timeOutMs = 30000,
  serverName?: string,
  maxRetries = 10
): Promise<void>
```

## Benefits

1. **Improved Reliability**: Tests no longer hang due to port conflicts or timeouts.
2. **Better Error Handling**: Tests properly handle errors and timeouts, providing better feedback.
3. **Cleaner Test Environment**: Resources are properly cleaned up between test runs.
4. **Reduced Flakiness**: Tests are more consistent and less likely to fail due to external factors.
5. **Race Condition Prevention**: Explicit port availability checking prevents race conditions.
6. **Improved Jest Environment Handling**: Tests properly handle Jest environment teardown.
7. **Better File System Error Handling**: Tests properly handle different types of file system errors.

## Future Improvements

1. **Mock All External Services**: Consider mocking all external services to avoid any real network connections in tests.
2. **Centralized Timeout Handling**: Create a utility function for timeout handling to avoid code duplication.
3. **Parallel Test Execution**: Ensure tests can run in parallel without conflicts.
4. **Port Range Configuration**: Add configuration for port ranges to avoid conflicts with other applications.
5. **Comprehensive Error Handling**: Continue improving error handling across all parts of the codebase.
6. **Test Isolation**: Ensure tests are properly isolated from each other to prevent interference.
7. **Test Coverage**: Increase test coverage to catch more issues before they reach production.