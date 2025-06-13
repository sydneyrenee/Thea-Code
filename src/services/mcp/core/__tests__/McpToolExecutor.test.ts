// npx jest src/services/mcp/core/__tests__/McpToolExecutor.test.ts

import { describe, expect, it, beforeEach, jest, afterEach } from "@jest/globals"
import { McpToolExecutor } from "../McpToolExecutor"
import { McpToolRegistry } from "../McpToolRegistry"
import { NeutralToolUseRequest } from "../../types/McpToolTypes"
import { ToolDefinition } from "../../types/McpProviderTypes"

// Define interface for the mock EmbeddedMcpProvider
interface MockEmbeddedMcpProviderInstance {
	start: jest.Mock
	stop: jest.Mock
	registerToolDefinition: jest.Mock
	unregisterTool: jest.Mock
	executeTool: jest.Mock
	getServerUrl: jest.Mock
	on: jest.Mock
	off: jest.Mock
	emit: jest.Mock
	removeAllListeners: jest.Mock
}

// Define interface for the mock constructor
interface MockEmbeddedMcpProviderConstructor {
	new (): MockEmbeddedMcpProviderInstance
	create: jest.Mock
}

// Mock the EmbeddedMcpProvider module
const mockEmbeddedMcpProviderInstance = {
	start: jest.fn().mockImplementation(() => Promise.resolve()),
	stop: jest.fn().mockImplementation(() => Promise.resolve()),
	registerToolDefinition: jest.fn(),
	unregisterTool: jest.fn().mockReturnValue(true),
	executeTool: jest.fn().mockImplementation((...args: unknown[]) => {
		const name = args[0] as string
		if (name === "error-tool") {
			return Promise.resolve({
				content: [{ type: "text", text: "Error executing tool" }],
				isError: true,
			})
		}

		if (name === "throw-error-tool") {
			return Promise.reject(new Error("Tool execution failed"))
		}

		return Promise.resolve({
			content: [{ type: "text", text: "Success" }],
		})
	}),
	getServerUrl: jest.fn().mockReturnValue(new URL("http://localhost:3000")),
	on: jest.fn(),
	off: jest.fn(),
	emit: jest.fn(),
	removeAllListeners: jest.fn(),
} as MockEmbeddedMcpProviderInstance

jest.mock("../../providers/EmbeddedMcpProvider", () => {
	const MockEmbeddedMcpProvider = jest.fn().mockImplementation(() => mockEmbeddedMcpProviderInstance)

	const mockConstructor = MockEmbeddedMcpProvider as unknown as MockEmbeddedMcpProviderConstructor
	mockConstructor.create = jest.fn().mockImplementation(() => {
		return Promise.resolve(mockEmbeddedMcpProviderInstance)
	})

	return {
		EmbeddedMcpProvider: mockConstructor,
	}
})

// Mock the McpToolRegistry
jest.mock("../McpToolRegistry", () => {
	const mockRegistry = {
		getInstance: jest.fn(),
		registerTool: jest.fn(),
		unregisterTool: jest.fn().mockReturnValue(true),
		getTool: jest.fn(),
		getAllTools: jest.fn(),
		hasTool: jest.fn(),
		executeTool: jest.fn(),
	}

	return {
		McpToolRegistry: {
			getInstance: jest.fn().mockReturnValue(mockRegistry),
		},
	}
})

describe("McpToolExecutor", () => {
	// Reset the singleton instance before each test
	beforeEach(() => {
		// Access private static instance property using type assertion
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
		;(McpToolExecutor as any).instance = undefined

		// Reset all mocks
		jest.clearAllMocks()
	})

	afterEach(() => {
		// Clean up any event listeners
		const instance = McpToolExecutor.getInstance()
		instance.removeAllListeners()
	})

	describe("Singleton Pattern", () => {
		it("should return the same instance when getInstance is called multiple times", () => {
			const instance1 = McpToolExecutor.getInstance()
			const instance2 = McpToolExecutor.getInstance()

			expect(instance1).toBe(instance2)
		})

		it("should return the same instance when getInstance is called multiple times", () => {
			const instance1 = McpToolExecutor.getInstance()
			const instance2 = McpToolExecutor.getInstance()

			expect(instance1).toBe(instance2)
		})
	})

	describe("Initialization and Shutdown", () => {
		it("should initialize the MCP provider when initialize is called", async () => {
			const executor = McpToolExecutor.getInstance()

			await executor.initialize()

			// Check that the mocked create method was called
			expect(mockEmbeddedMcpProviderInstance.start).toHaveBeenCalled()
		})

		it("should not initialize the MCP provider if already initialized", async () => {
			const executor = McpToolExecutor.getInstance()

			await executor.initialize()
			await executor.initialize() // Call initialize again

			// start should only be called once
			expect(mockEmbeddedMcpProviderInstance.start).toHaveBeenCalledTimes(1)
		})

		it("should shutdown the MCP provider when shutdown is called", async () => {
			const executor = McpToolExecutor.getInstance()

			await executor.initialize()
			await executor.shutdown()

			expect(mockEmbeddedMcpProviderInstance.stop).toHaveBeenCalled()
		})

		it("should not shutdown the MCP provider if not initialized", async () => {
			const executor = McpToolExecutor.getInstance()

			await executor.shutdown()

			// Since executor was not initialized, mcpProvider should be undefined
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			expect((executor as any).mcpProvider).toBeUndefined()
		})
	})

	describe("Tool Registration", () => {
		it("should register a tool with both the MCP provider and the tool registry", async () => {
			const executor = McpToolExecutor.getInstance()
			await executor.initialize()

			const toolDefinition: ToolDefinition = {
				name: "test-tool",
				description: "Test tool",
				handler: () => Promise.resolve({ content: [] }),
			}

			executor.registerTool(toolDefinition)

			expect(mockEmbeddedMcpProviderInstance.registerToolDefinition).toHaveBeenCalledWith(toolDefinition)
			// Check the mock registry was called correctly - using the mocked getInstance
			const mockRegistry = McpToolRegistry.getInstance()
			// eslint-disable-next-line @typescript-eslint/unbound-method
			expect(mockRegistry.registerTool).toHaveBeenCalledWith(toolDefinition)
		})

		it("should unregister a tool from both the MCP provider and the tool registry", async () => {
			const executor = McpToolExecutor.getInstance()
			await executor.initialize()

			const result = executor.unregisterTool("test-tool")

			expect(mockEmbeddedMcpProviderInstance.unregisterTool).toHaveBeenCalledWith("test-tool")
			const mockRegistry = McpToolRegistry.getInstance()
			// eslint-disable-next-line @typescript-eslint/unbound-method
			expect(mockRegistry.unregisterTool).toHaveBeenCalledWith("test-tool")
			expect(result).toBe(true)
		})
	})

	describe("Tool Execution", () => {
		it("should execute a tool with valid input in neutral format", async () => {
			const executor = McpToolExecutor.getInstance()
			await executor.initialize()

			const request: NeutralToolUseRequest = {
				type: "tool_use",
				id: "test-id",
				name: "test-tool",
				input: { param: "value" },
			}

			const result = await executor.executeToolFromNeutralFormat(request)

			expect(mockEmbeddedMcpProviderInstance.executeTool).toHaveBeenCalledWith("test-tool", { param: "value" })
			expect(result).toEqual({
				type: "tool_result",
				tool_use_id: "test-id",
				content: [{ type: "text", text: "Success" }],
				status: "success",
				error: undefined,
			})
		})

		it("should handle errors when executing a tool", async () => {
			const executor = McpToolExecutor.getInstance()
			await executor.initialize()

			const request: NeutralToolUseRequest = {
				type: "tool_use",
				id: "error-id",
				name: "error-tool",
				input: {},
			}

			const result = await executor.executeToolFromNeutralFormat(request)

			expect(mockEmbeddedMcpProviderInstance.executeTool).toHaveBeenCalledWith("error-tool", {})
			expect(result).toEqual({
				type: "tool_result",
				tool_use_id: "error-id",
				content: [{ type: "text", text: "Error executing tool" }],
				status: "error",
				error: {
					message: "Error executing tool",
				},
			})
		})

		it("should handle exceptions when executing a tool", async () => {
			const executor = McpToolExecutor.getInstance()
			await executor.initialize()

			const request: NeutralToolUseRequest = {
				type: "tool_use",
				id: "exception-id",
				name: "throw-error-tool",
				input: {},
			}

			const result = await executor.executeToolFromNeutralFormat(request)

			expect(mockEmbeddedMcpProviderInstance.executeTool).toHaveBeenCalledWith("throw-error-tool", {})
			expect(result).toEqual({
				type: "tool_result",
				tool_use_id: "exception-id",
				content: [
					{
						type: "text",
						text: "Error executing tool 'throw-error-tool': Tool execution failed",
					},
				],
				status: "error",
				error: {
					message: "Tool execution failed",
				},
			})
		})
	})

	describe("Event Handling", () => {
		it("should forward tool-registered events from the MCP provider", async () => {
			const executor = McpToolExecutor.getInstance()
			await executor.initialize()

			const eventHandler = jest.fn()
			executor.on("tool-registered", eventHandler)

			// Emit the event from the provider using our mock instance
			mockEmbeddedMcpProviderInstance.emit("tool-registered", "test-tool")

			expect(eventHandler).toHaveBeenCalledWith("test-tool")
		})

		it("should forward tool-unregistered events from the MCP provider", async () => {
			const executor = McpToolExecutor.getInstance()
			await executor.initialize()

			const eventHandler = jest.fn()
			executor.on("tool-unregistered", eventHandler)

			// Emit the event from the provider using our mock instance
			mockEmbeddedMcpProviderInstance.emit("tool-unregistered", "test-tool")

			expect(eventHandler).toHaveBeenCalledWith("test-tool")
		})

		it("should forward started events from the MCP provider", async () => {
			const executor = McpToolExecutor.getInstance()
			await executor.initialize()

			const eventHandler = jest.fn()
			executor.on("started", eventHandler)

			// Emit the event from the provider using our mock instance
			const info = { url: "http://localhost:3000" }
			mockEmbeddedMcpProviderInstance.emit("started", info)

			expect(eventHandler).toHaveBeenCalledWith(info)
		})

		it("should forward stopped events from the MCP provider", async () => {
			const executor = McpToolExecutor.getInstance()
			await executor.initialize()

			const eventHandler = jest.fn()
			executor.on("stopped", eventHandler)

			// Emit the event from the provider using our mock instance
			mockEmbeddedMcpProviderInstance.emit("stopped")

			expect(eventHandler).toHaveBeenCalled()
		})
	})

	describe("Accessors", () => {
		it("should return the tool registry", () => {
			const executor = McpToolExecutor.getInstance()
			const registry = executor.getToolRegistry()

			expect(registry).toBe(McpToolRegistry.getInstance())
		})

		it("should return the server URL", async () => {
			const executor = McpToolExecutor.getInstance()
			await executor.initialize()

			const url = executor.getServerUrl()

			expect(url).toEqual(mockEmbeddedMcpProviderInstance.getServerUrl())
		})
	})
})
