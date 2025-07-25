import React from "react"
import { render, waitFor } from "@testing-library/react"
import ChatView from "../ChatView"
import { ExtensionStateContextProvider } from "../../../context/ExtensionStateContext"
import { vscode } from "../../../utils/vscode"
import { TheaMessage } from "../../../../../src/shared/ExtensionMessage"

// Mock vscode API
jest.mock("../../../utils/vscode", () => ({
	vscode: {
		postMessage: jest.fn(),
	},
}))

// Mock all problematic dependencies
jest.mock("rehype-highlight", () => ({
	__esModule: true,
	default: () => () => {},
}))

jest.mock("hast-util-to-text", () => ({
	__esModule: true,
	default: () => "",
}))

// Mock components that use ESM dependencies
jest.mock("../BrowserSessionRow", () => ({
	__esModule: true,
	default: function MockBrowserSessionRow({ messages }: { messages: TheaMessage[] }) {
		return <div data-testid="browser-session">{JSON.stringify(messages)}</div>
	},
}))

jest.mock("../ChatRow", () => ({
	__esModule: true,
	default: function MockChatRow({ message }: { message: TheaMessage }) {
		return <div data-testid="chat-row">{JSON.stringify(message)}</div>
	},
}))

jest.mock("../TaskHeader", () => ({
	__esModule: true,
	default: function MockTaskHeader({ task }: { task: TheaMessage }) {
		return <div data-testid="task-header">{JSON.stringify(task)}</div>
	},
}))

jest.mock("../AutoApproveMenu", () => ({
	__esModule: true,
	default: () => null,
}))

jest.mock("../../common/CodeBlock", () => ({
	__esModule: true,
	default: () => null,
	CODE_BLOCK_BG_COLOR: "rgb(30, 30, 30)",
}))

jest.mock("../../common/CodeAccordian", () => ({
	__esModule: true,
	default: () => null,
}))

jest.mock("../ContextMenu", () => ({
	__esModule: true,
	default: () => null,
}))

// Mock window.postMessage to trigger state hydration
const mockPostMessage = (state: Partial<Record<string, unknown>>) => {
	window.postMessage(
		{
			type: "state",
			state: {
				version: "1.0.0",
				clineMessages: [],
				taskHistory: [],
				shouldShowAnnouncement: false,
				allowedCommands: [],
				alwaysAllowExecute: false,
				autoApprovalEnabled: true,
				...state,
			},
		},
		"*",
	)
}

describe("ChatView - Auto Approval Tests", () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("auto-approves read operations when enabled", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowReadOnly: true,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the read tool ask message
		mockPostMessage({
			alwaysAllowReadOnly: true,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
					partial: false,
				},
			],
		})

		// Wait for the auto-approval message
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "yesButtonClicked",
			})
		})
	})

	it("auto-approves outside workspace read operations when enabled", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowReadOnly: true,
			alwaysAllowReadOnlyOutsideWorkspace: true,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the read tool ask message with an absolute path (outside workspace)
		mockPostMessage({
			alwaysAllowReadOnly: true,
			alwaysAllowReadOnlyOutsideWorkspace: true,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({
						tool: "readFile",
						path: "/absolute/path/test.txt",
						// Use an absolute path that's clearly outside workspace
					}),
					partial: false,
				},
			],
		})

		// Also mock the filePaths for workspace detection
		mockPostMessage({
			alwaysAllowReadOnly: true,
			alwaysAllowReadOnlyOutsideWorkspace: true,
			autoApprovalEnabled: true,
			filePaths: ["/workspace/root", "/another/workspace"],
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({
						tool: "readFile",
						path: "/absolute/path/test.txt",
					}),
					partial: false,
				},
			],
		})

		// Wait for the auto-approval message
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "yesButtonClicked",
			})
		})
	})

	it("does not auto-approve outside workspace read operations without permission", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowReadOnly: true,
			alwaysAllowReadOnlyOutsideWorkspace: false, // No permission for outside workspace
			autoApprovalEnabled: true,
			filePaths: ["/workspace/root", "/another/workspace"], // Same workspace paths as before
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the read tool ask message with an absolute path (outside workspace)
		mockPostMessage({
			alwaysAllowReadOnly: true,
			alwaysAllowReadOnlyOutsideWorkspace: false,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({
						tool: "readFile",
						path: "/absolute/path/test.txt",
						isOutsideWorkspace: true, // Explicitly indicate this is outside workspace
					}),
					partial: false,
				},
			],
		})

		// Wait a short time and verify no auto-approval message was sent
		await new Promise((resolve) => setTimeout(resolve, 100))
		expect(vscode.postMessage).not.toHaveBeenCalledWith({
			type: "askResponse",
			askResponse: "yesButtonClicked",
		})
	})

	it("does not auto-approve when autoApprovalEnabled is false", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowReadOnly: true,
			autoApprovalEnabled: false,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the read tool ask message
		mockPostMessage({
			alwaysAllowReadOnly: true,
			autoApprovalEnabled: false,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
					partial: false,
				},
			],
		})

		// Verify no auto-approval message was sent
		expect(vscode.postMessage).not.toHaveBeenCalledWith({
			type: "askResponse",
			askResponse: "yesButtonClicked",
		})
	})

	it("auto-approves write operations when enabled", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowWrite: true,
			autoApprovalEnabled: true,
			writeDelayMs: 0,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the write tool ask message
		mockPostMessage({
			alwaysAllowWrite: true,
			autoApprovalEnabled: true,
			writeDelayMs: 0,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "editedExistingFile", path: "test.txt" }),
					partial: false,
				},
			],
		})

		// Wait for the auto-approval message
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "yesButtonClicked",
			})
		})
	})

	it("auto-approves outside workspace write operations when enabled", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowWrite: true,
			alwaysAllowWriteOutsideWorkspace: true,
			autoApprovalEnabled: true,
			writeDelayMs: 0, // Set to 0 for testing
			filePaths: ["/workspace/root", "/another/workspace"], // Define workspace paths for testing
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the write tool ask message with an absolute path (outside workspace)
		mockPostMessage({
			alwaysAllowWrite: true,
			alwaysAllowWriteOutsideWorkspace: true,
			autoApprovalEnabled: true,
			writeDelayMs: 0,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({
						tool: "editedExistingFile",
						path: "/absolute/path/test.txt",
						content: "Test content",
					}),
					partial: false,
				},
			],
		})

		// Wait for the auto-approval message
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "yesButtonClicked",
			})
		})
	})

	it("does not auto-approve outside workspace write operations without permission", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowWrite: true,
			alwaysAllowWriteOutsideWorkspace: false, // No permission for outside workspace
			autoApprovalEnabled: true,
			writeDelayMs: 0,
			filePaths: ["/workspace/root", "/another/workspace"], // Define workspace paths for testing
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the write tool ask message with an absolute path (outside workspace)
		mockPostMessage({
			alwaysAllowWrite: true,
			alwaysAllowWriteOutsideWorkspace: false,
			autoApprovalEnabled: true,
			writeDelayMs: 0,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({
						tool: "editedExistingFile",
						path: "/absolute/path/test.txt",
						content: "Test content",
						isOutsideWorkspace: true, // Explicitly indicate this is outside workspace
					}),
					partial: false,
				},
			],
		})

		// Wait a short time and verify no auto-approval message was sent
		await new Promise((resolve) => setTimeout(resolve, 100))
		expect(vscode.postMessage).not.toHaveBeenCalledWith({
			type: "askResponse",
			askResponse: "yesButtonClicked",
		})
	})

	it("auto-approves browser actions when enabled", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowBrowser: true,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the browser action ask message
		mockPostMessage({
			alwaysAllowBrowser: true,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "browser_action_launch",
					ts: Date.now(),
					text: JSON.stringify({ action: "launch", url: "http://example.com" }),
					partial: false,
				},
			],
		})

		// Wait for the auto-approval message
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "yesButtonClicked",
			})
		})
	})

	it("auto-approves mode switch when enabled", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowModeSwitch: true,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the mode switch ask message
		mockPostMessage({
			alwaysAllowModeSwitch: true,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "switchMode" }),
					partial: false,
				},
			],
		})

		// Wait for the auto-approval message
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "askResponse",
				askResponse: "yesButtonClicked",
			})
		})
	})

	it("does not auto-approve mode switch when disabled", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowModeSwitch: false,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the mode switch ask message
		mockPostMessage({
			alwaysAllowModeSwitch: false,
			autoApprovalEnabled: true,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "switchMode" }),
					partial: false,
				},
			],
		})

		// Verify no auto-approval message was sent
		expect(vscode.postMessage).not.toHaveBeenCalledWith({
			type: "askResponse",
			askResponse: "yesButtonClicked",
		})
	})

	it("does not auto-approve mode switch when auto-approval is disabled", async () => {
		render(
			<ExtensionStateContextProvider>
				<ChatView
					isHidden={false}
					showAnnouncement={false}
					hideAnnouncement={() => {}}
					showHistoryView={() => {}}
				/>
			</ExtensionStateContextProvider>,
		)

		// First hydrate state with initial task
		mockPostMessage({
			alwaysAllowModeSwitch: true,
			autoApprovalEnabled: false,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
			],
		})

		// Then send the mode switch ask message
		mockPostMessage({
			alwaysAllowModeSwitch: true,
			autoApprovalEnabled: false,
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "switchMode" }),
					partial: false,
				},
			],
		})

		// Verify no auto-approval message was sent
		expect(vscode.postMessage).not.toHaveBeenCalledWith({
			type: "askResponse",
			askResponse: "yesButtonClicked",
		})
	})
})
