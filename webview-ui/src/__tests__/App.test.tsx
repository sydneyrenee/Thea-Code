// npx jest src/__tests__/App.test.tsx

import React from "react"
import { render, screen, act, cleanup } from "@testing-library/react"
import "@testing-library/jest-dom"

import AppWithProviders from "../App"

jest.mock("../utils/vscode", () => ({
	vscode: {
		postMessage: jest.fn(),
	},
}))

// Mock react-use hooks
jest.mock("react-use", () => ({
	useEvent: jest.fn(() => {
		// Return a no-op function for event listeners
	}),
}))

// Mock i18n
jest.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: {
			changeLanguage: jest.fn(),
			language: "en",
		},
	}),
}))

// Mock TranslationProvider  
jest.mock("../i18n/TranslationContext", () => ({
	__esModule: true,
	default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock TelemetryClient
jest.mock("../utils/TelemetryClient", () => ({
	telemetryClient: {
		updateTelemetryState: jest.fn(),
		capture: jest.fn(),
	},
}))

// Mock WelcomeView
jest.mock("../components/welcome/WelcomeView", () => ({
	__esModule: true,
	default: () => <div data-testid="welcome-view">Welcome View</div>,
}))

jest.mock("../components/chat/ChatView", () => ({
	__esModule: true,
	default: function ChatView({ isHidden }: { isHidden: boolean }) {
		return (
			<div data-testid="chat-view" data-hidden={isHidden}>
				Chat View
			</div>
		)
	},
}))

jest.mock("../components/settings/SettingsView", () => ({
	__esModule: true,
	default: function SettingsView({ onDone }: { onDone: () => void }) {
		return (
			<div data-testid="settings-view" onClick={onDone}>
				Settings View
			</div>
		)
	},
}))

jest.mock("../components/history/HistoryView", () => ({
	__esModule: true,
	default: function HistoryView({ onDone }: { onDone: () => void }) {
		return (
			<div data-testid="history-view" onClick={onDone}>
				History View
			</div>
		)
	},
}))

jest.mock("../components/mcp/McpView", () => ({
	__esModule: true,
	default: function McpView({ onDone }: { onDone: () => void }) {
		return (
			<div data-testid="mcp-view" onClick={onDone}>
				MCP View
			</div>
		)
	},
}))

jest.mock("../components/prompts/PromptsView", () => ({
	__esModule: true,
	default: function PromptsView({ onDone }: { onDone: () => void }) {
		return (
			<div data-testid="prompts-view" onClick={onDone}>
				Prompts View
			</div>
		)
	},
}))

jest.mock("../context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		didHydrateState: true,
		showWelcome: false,
		shouldShowAnnouncement: false,
		telemetrySetting: "enabled",
		telemetryKey: "test-key",
		machineId: "test-machine",
		// Add other required properties with default values
		apiConfiguration: {},
		customInstructions: undefined,
		alwaysAllowReadOnly: false,
		alwaysAllowReadOnlyOutsideWorkspace: false,
		alwaysAllowWrite: false,
		alwaysAllowWriteOutsideWorkspace: false,
		alwaysAllowExecute: false,
		alwaysAllowBrowser: false,
		alwaysAllowMcp: false,
		alwaysAllowModeSwitch: false,
		alwaysAllowSubtasks: false,
		browserToolEnabled: false,
		showTheaIgnoredFiles: false,
		soundEnabled: false,
		soundVolume: 1,
		ttsEnabled: false,
		ttsSpeed: 1,
		diffEnabled: false,
		enableCheckpoints: false,
		browserViewportSize: "1280x720",
		fuzzyMatchThreshold: 0.5,
		writeDelayMs: 0,
		screenshotQuality: 80,
		allowedCommands: [],
		terminalShellIntegrationTimeout: 5000,
		theme: {},
		mcpServers: [],
		filePaths: [],
		openedTabs: [],
		currentTaskItem: undefined,
		currentCheckpoint: undefined,
		language: "en",
	}),
	ExtensionStateContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("App", () => {
	beforeEach(() => {
		jest.clearAllMocks()
		window.removeEventListener("message", () => {})
	})

	afterEach(() => {
		cleanup()
		window.removeEventListener("message", () => {})
	})

	const triggerMessage = (action: string) => {
		const messageEvent = new MessageEvent("message", {
			data: {
				type: "action",
				action,
			},
		})
		window.dispatchEvent(messageEvent)
	}

	it("shows chat view by default", () => {
		render(<AppWithProviders />)

		const chatView = screen.getByTestId("chat-view")
		expect(chatView).toBeInTheDocument()
		expect(chatView.getAttribute("data-hidden")).toBe("false")
	})

	it("switches to settings view when receiving settingsButtonClicked action", async () => {
		render(<AppWithProviders />)

		act(() => {
			triggerMessage("settingsButtonClicked")
		})

		const settingsView = await screen.findByTestId("settings-view")
		expect(settingsView).toBeInTheDocument()

		const chatView = screen.getByTestId("chat-view")
		expect(chatView.getAttribute("data-hidden")).toBe("true")
	})

	it("switches to history view when receiving historyButtonClicked action", async () => {
		render(<AppWithProviders />)

		act(() => {
			triggerMessage("historyButtonClicked")
		})

		const historyView = await screen.findByTestId("history-view")
		expect(historyView).toBeInTheDocument()

		const chatView = screen.getByTestId("chat-view")
		expect(chatView.getAttribute("data-hidden")).toBe("true")
	})

	it("switches to MCP view when receiving mcpButtonClicked action", async () => {
		render(<AppWithProviders />)

		act(() => {
			triggerMessage("mcpButtonClicked")
		})

		const mcpView = await screen.findByTestId("mcp-view")
		expect(mcpView).toBeInTheDocument()

		const chatView = screen.getByTestId("chat-view")
		expect(chatView.getAttribute("data-hidden")).toBe("true")
	})

	it("switches to prompts view when receiving promptsButtonClicked action", async () => {
		render(<AppWithProviders />)

		act(() => {
			triggerMessage("promptsButtonClicked")
		})

		const promptsView = await screen.findByTestId("prompts-view")
		expect(promptsView).toBeInTheDocument()

		const chatView = screen.getByTestId("chat-view")
		expect(chatView.getAttribute("data-hidden")).toBe("true")
	})

	it("returns to chat view when clicking done in settings view", async () => {
		render(<AppWithProviders />)

		act(() => {
			triggerMessage("settingsButtonClicked")
		})

		const settingsView = await screen.findByTestId("settings-view")

		act(() => {
			settingsView.click()
		})

		const chatView = screen.getByTestId("chat-view")
		expect(chatView.getAttribute("data-hidden")).toBe("false")
		expect(screen.queryByTestId("settings-view")).not.toBeInTheDocument()
	})

	it.each(["history", "mcp", "prompts"])("returns to chat view when clicking done in %s view", async (view) => {
		render(<AppWithProviders />)

		act(() => {
			triggerMessage(`${view}ButtonClicked`)
		})

		const viewElement = await screen.findByTestId(`${view}-view`)

		act(() => {
			viewElement.click()
		})

		const chatView = screen.getByTestId("chat-view")
		expect(chatView.getAttribute("data-hidden")).toBe("false")
		expect(screen.queryByTestId(`${view}-view`)).not.toBeInTheDocument()
	})
})
