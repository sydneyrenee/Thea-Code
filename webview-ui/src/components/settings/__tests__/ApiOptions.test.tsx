// npx jest src/components/settings/__tests__/ApiOptions.test.ts

import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionStateContextProvider } from "@/context/ExtensionStateContext"

import ApiOptions from "../ApiOptions"

// Mock VSCode components
jest.mock("@/components/ui/vscode-components", () => ({
	VSCodeTextField: ({ children, value, onBlur }: { [key: string]: unknown }) => (
		<div>
			{children}
			<input type="text" value={value} onChange={onBlur} />
		</div>
	),
	VSCodeLink: ({ children, href }: { [key: string]: unknown }) => <a href={href}>{children}</a>,
	VSCodeRadio: ({ value, checked }: { [key: string]: unknown }) => (
		<input type="radio" value={value} checked={checked} />
	),
	VSCodeRadioGroup: ({ children }: { [key: string]: unknown }) => <div>{children}</div>,
	VSCodeButton: ({ children }: { [key: string]: unknown }) => <div>{children}</div>,
}))

// Mock other components
jest.mock("vscrui", () => ({
	Checkbox: ({ children, checked, onChange }: { [key: string]: unknown }) => (
		<label>
			<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
			{children}
		</label>
	),
	Button: ({ children, onClick }: { [key: string]: unknown }) => <button onClick={onClick}>{children}</button>,
}))

// Mock @shadcn/ui components
jest.mock("@/components/ui", () => ({
	Select: ({ children, value, onValueChange }: { [key: string]: unknown }) => (
		<div className="select-mock">
			<select value={value} onChange={(e) => onValueChange && onValueChange(e.target.value)}>
				{children}
			</select>
		</div>
	),
	SelectTrigger: ({ children }: { [key: string]: unknown }) => <div className="select-trigger-mock">{children}</div>,
	SelectValue: ({ children }: { [key: string]: unknown }) => <div className="select-value-mock">{children}</div>,
	SelectContent: ({ children }: { [key: string]: unknown }) => <div className="select-content-mock">{children}</div>,
	SelectItem: ({ children, value }: { [key: string]: unknown }) => (
		<option value={value} className="select-item-mock">
			{children}
		</option>
	),
	SelectSeparator: ({ children }: { [key: string]: unknown }) => (
		<div className="select-separator-mock">{children}</div>
	),
	Button: ({ children, onClick }: { [key: string]: unknown }) => (
		<button onClick={onClick} className="button-mock">
			{children}
		</button>
	),
}))

jest.mock("../TemperatureControl", () => ({
	TemperatureControl: ({ value, onChange }: { [key: string]: unknown }) => (
		<div data-testid="temperature-control">
			<input
				type="range"
				value={value || 0}
				onChange={(e) => onChange(parseFloat(e.target.value))}
				min={0}
				max={2}
				step={0.1}
			/>
		</div>
	),
}))

// Mock ThinkingBudget component
jest.mock("../ThinkingBudget", () => ({
	ThinkingBudget: ({
		apiConfiguration,
		modelInfo,
		provider,
	}: {
		[key: string]: unknown
	}) =>
		modelInfo?.thinking ? (
			<div data-testid="thinking-budget" data-provider={provider}>
				<input data-testid="thinking-tokens" value={apiConfiguration?.modelMaxThinkingTokens} />
			</div>
		) : null,
}))

const renderApiOptions = (props = {}) => {
	const queryClient = new QueryClient()

	render(
		<ExtensionStateContextProvider>
			<QueryClientProvider client={queryClient}>
				<ApiOptions
					errorMessage={undefined}
					setErrorMessage={() => {}}
					uriScheme={undefined}
					apiConfiguration={{}}
					setApiConfigurationField={() => {}}
					{...props}
				/>
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

describe("ApiOptions", () => {
	it("shows temperature control by default", () => {
		renderApiOptions()
		expect(screen.getByTestId("temperature-control")).toBeInTheDocument()
	})

	it("hides temperature control when fromWelcomeView is true", () => {
		renderApiOptions({ fromWelcomeView: true })
		expect(screen.queryByTestId("temperature-control")).not.toBeInTheDocument()
	})

	describe("thinking functionality", () => {
		it("should show ThinkingBudget for Anthropic models that support thinking", () => {
			renderApiOptions({
				apiConfiguration: {
					apiProvider: "anthropic",
					apiModelId: "claude-3-7-sonnet-20250219:thinking",
				},
			})

			expect(screen.getByTestId("thinking-budget")).toBeInTheDocument()
		})

		it("should show ThinkingBudget for Vertex models that support thinking", () => {
			renderApiOptions({
				apiConfiguration: {
					apiProvider: "vertex",
					apiModelId: "claude-3-7-sonnet@20250219:thinking",
				},
			})

			expect(screen.getByTestId("thinking-budget")).toBeInTheDocument()
		})

		it("should not show ThinkingBudget for models that don't support thinking", () => {
			renderApiOptions({
				apiConfiguration: {
					apiProvider: "anthropic",
					apiModelId: "claude-3-opus-20240229",
					modelInfo: { thinking: false }, // Non-thinking model
				},
			})

			expect(screen.queryByTestId("thinking-budget")).not.toBeInTheDocument()
		})

		// Note: We don't need to test the actual ThinkingBudget component functionality here
		// since we have separate tests for that component. We just need to verify that
		// it's included in the ApiOptions component when appropriate.
	})
})
