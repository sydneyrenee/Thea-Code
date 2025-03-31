// cd webview-ui && npx jest src/context/__tests__/ExtensionStateContext.test.tsx

import { render, screen, act } from "@testing-library/react"
import { fireEvent, waitFor } from "@testing-library/react"

import { ExtensionState } from "../../../../src/shared/ExtensionMessage"
import { ExtensionStateContextProvider, useExtensionState, mergeExtensionState } from "../ExtensionStateContext"
import { ExperimentId } from "../../../../src/shared/experiments"
import { ApiConfiguration } from "../../../../src/shared/api"

// Test component that consumes the context
const TestComponent = () => {
	const { allowedCommands, setAllowedCommands, soundEnabled, showTheaCodeIgnoredFiles, setShowTheaCodeIgnoredFiles } = // Updated key name
		useExtensionState()
	return (
		<div>
			<div data-testid="allowed-commands">{JSON.stringify(allowedCommands)}</div>
			<div data-testid="sound-enabled">{JSON.stringify(soundEnabled)}</div>
			<div data-testid="show-theacodeignored-files">{JSON.stringify(showTheaCodeIgnoredFiles)}</div> {/* Updated data-testid and variable */}
			<button data-testid="update-button" onClick={() => setAllowedCommands(["npm install", "git status"])}>
				Update Commands
			</button>
			<button data-testid="toggle-theaignore-button" onClick={() => setShowTheaCodeIgnoredFiles(!showTheaCodeIgnoredFiles)}> {/* Updated setter and variable */}
				Update Commands
			</button>
		</div>
	)
}

// Test component for API configuration
const ApiConfigTestComponent = () => {
	const { apiConfiguration, setApiConfiguration } = useExtensionState()
	return (
		<div>
			<div data-testid="api-configuration">{JSON.stringify(apiConfiguration)}</div>
			<button
				data-testid="update-api-config-button"
				onClick={() => setApiConfiguration({ apiModelId: "new-model", apiProvider: "anthropic" })}>
				Update API Config
			</button>
			<button data-testid="partial-update-button" onClick={() => setApiConfiguration({ modelTemperature: 0.7 })}>
				Partial Update
			</button>
		</div>
	)
}

describe("ExtensionStateContext", () => {
	it("initializes with empty allowedCommands array", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		expect(JSON.parse(screen.getByTestId("allowed-commands").textContent!)).toEqual([])
	})

	it("initializes with soundEnabled set to false", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		expect(JSON.parse(screen.getByTestId("sound-enabled").textContent!)).toBe(false)
	})
	
		it("initializes with showTheaCodeIgnoredFiles set to true", () => { // Updated test name
			render(
				<ExtensionStateContextProvider>
					<TestComponent />
				</ExtensionStateContextProvider>,
			)
	
			expect(JSON.parse(screen.getByTestId("show-theacodeignored-files").textContent!)).toBe(true) // Updated test ID
		})

	it("updates showTheaCodeIgnoredFiles through setShowTheaCodeIgnoredFiles", async () => { // Updated test name & added async
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		const displayElement = screen.getByTestId("show-theacodeignored-files")
		const toggleButton = screen.getByTestId("toggle-theaignore-button")

		// Initial state check
		expect(JSON.parse(displayElement.textContent!)).toBe(true)

		// Click once to toggle to false
		act(() => {
			fireEvent.click(toggleButton)
		})
		// Wait for the text content to become "false" before asserting
		await waitFor(() => expect(displayElement).toHaveTextContent("false"));

		// Click again to toggle back to true
		act(() => {
			fireEvent.click(toggleButton)
		})
		// Wait for the text content to become "true" before asserting
		await waitFor(() => expect(displayElement).toHaveTextContent("true"));
		})
	
		it("updates allowedCommands through setAllowedCommands", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		act(() => {
			screen.getByTestId("update-button").click()
		})

		expect(JSON.parse(screen.getByTestId("allowed-commands").textContent!)).toEqual(["npm install", "git status"])
	})

	it("throws error when used outside provider", () => {
		// Suppress console.error for this test since we expect an error
		const consoleSpy = jest.spyOn(console, "error")
		consoleSpy.mockImplementation(() => {})

		expect(() => {
			render(<TestComponent />)
		}).toThrow("useExtensionState must be used within an ExtensionStateContextProvider")

		consoleSpy.mockRestore()
	})

	it("updates apiConfiguration through setApiConfiguration", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiConfigTestComponent />
			</ExtensionStateContextProvider>,
		)

		const initialContent = screen.getByTestId("api-configuration").textContent!
		expect(initialContent).toBeDefined()

		act(() => {
			screen.getByTestId("update-api-config-button").click()
		})

		const updatedContent = screen.getByTestId("api-configuration").textContent!
		const updatedConfig = JSON.parse(updatedContent || "{}")

		expect(updatedConfig).toEqual(
			expect.objectContaining({
				apiModelId: "new-model",
				apiProvider: "anthropic",
			}),
		)
	})

	it("correctly merges partial updates to apiConfiguration", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiConfigTestComponent />
			</ExtensionStateContextProvider>,
		)

		// First set the initial configuration
		act(() => {
			screen.getByTestId("update-api-config-button").click()
		})

		// Verify initial update
		const initialContent = screen.getByTestId("api-configuration").textContent!
		const initialConfig = JSON.parse(initialContent || "{}")
		expect(initialConfig).toEqual(
			expect.objectContaining({
				apiModelId: "new-model",
				apiProvider: "anthropic",
			}),
		)

		// Now perform a partial update
		act(() => {
			screen.getByTestId("partial-update-button").click()
		})

		// Verify that the partial update was merged with the existing configuration
		const updatedContent = screen.getByTestId("api-configuration").textContent!
		const updatedConfig = JSON.parse(updatedContent || "{}")
		expect(updatedConfig).toEqual(
			expect.objectContaining({
				apiModelId: "new-model", // Should retain this from previous update
				apiProvider: "anthropic", // Should retain this from previous update
				modelTemperature: 0.7, // Should add this from partial update
			}),
		)
	})
})

describe("mergeExtensionState", () => {
	it("should correctly merge extension states", () => {
		const baseState: ExtensionState = {
			version: "",
			mcpEnabled: false,
			enableMcpServerCreation: false,
			clineMessages: [],
			taskHistory: [],
			shouldShowAnnouncement: false,
			enableCheckpoints: true,
			checkpointStorage: "task",
			writeDelayMs: 1000,
			requestDelaySeconds: 5,
			rateLimitSeconds: 0,
			mode: "default",
			experiments: {} as Record<ExperimentId, boolean>,
			customModes: [],
			maxOpenTabsContext: 20,
			maxWorkspaceFiles: 100,
			apiConfiguration: { providerId: "openrouter" } as ApiConfiguration,
			telemetrySetting: "unset",
			showTheaCodeIgnoredFiles: true, // Updated key name
			renderContext: "sidebar",
			maxReadFileLine: 500,
		}

		const prevState: ExtensionState = {
			...baseState,
			apiConfiguration: { modelMaxTokens: 1234, modelMaxThinkingTokens: 123 },
			experiments: {
				experimentalDiffStrategy: true,
				search_and_replace: true,
				insert_content: true,
			} as Record<ExperimentId, boolean>,
		}

		const newState: ExtensionState = {
			...baseState,
			apiConfiguration: { modelMaxThinkingTokens: 456, modelTemperature: 0.3 },
			experiments: {
				powerSteering: true,
				multi_search_and_replace: true,
			} as Record<ExperimentId, boolean>,
		}

		const result = mergeExtensionState(prevState, newState)

		expect(result.apiConfiguration).toEqual({
			modelMaxThinkingTokens: 456,
			modelTemperature: 0.3,
		})

		expect(result.experiments).toEqual({
			experimentalDiffStrategy: true,
			search_and_replace: true,
			insert_content: true,
			powerSteering: true,
			multi_search_and_replace: true,
		})
	})
})
