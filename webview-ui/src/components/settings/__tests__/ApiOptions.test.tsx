// npx jest src/components/settings/__tests__/ApiOptions.test.ts

import React from "react"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionStateContextProvider } from "@/context/ExtensionStateContext"

import ApiOptions from "../ApiOptions"

// Mock VSCode components
jest.mock("@/components/ui/vscode-components", () => ({
	VSCodeTextField: ({ children, value, onBlur }: { [key: string]: unknown }) => (
		<div>
			{children as React.ReactNode}
			<input type="text" value={value as string} onChange={onBlur as React.ChangeEventHandler<HTMLInputElement>} />
		</div>
	),
	VSCodeLink: ({ children, href }: { [key: string]: unknown }) => <a href={href as string}>{children as React.ReactNode}</a>,
	VSCodeRadio: ({ value, checked }: { [key: string]: unknown }) => (
		<input type="radio" value={value as string} checked={checked as boolean} />
	),
	VSCodeRadioGroup: ({ children }: { [key: string]: unknown }) => <div>{children as React.ReactNode}</div>,
	VSCodeButton: ({ children }: { [key: string]: unknown }) => <div>{children as React.ReactNode}</div>,
}))

// Mock other components
jest.mock("vscrui", () => ({
	Checkbox: ({ children, checked, onChange }: { [key: string]: unknown }) => (
		<label>
			<input type="checkbox" checked={checked as boolean} onChange={(e) => (onChange as ((checked: boolean) => void))?.(e.target.checked)} />
			{children as React.ReactNode}
		</label>
	),
	Button: ({ children, onClick }: { [key: string]: unknown }) => <button onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}>{children as React.ReactNode}</button>,
}))

// Mock @shadcn/ui components
jest.mock("@/components/ui", () => ({
	Select: ({ children, value, onValueChange }: { [key: string]: unknown }) => (
		<div className="select-mock">
			<select value={value as string} onChange={(e) => (onValueChange as ((value: string) => void))?.(e.target.value)}>
				{children as React.ReactNode}
			</select>
		</div>
	),
	SelectTrigger: ({ children }: { [key: string]: unknown }) => <div className="select-trigger-mock">{children as React.ReactNode}</div>,
	SelectValue: ({ children }: { [key: string]: unknown }) => <div className="select-value-mock">{children as React.ReactNode}</div>,
	SelectContent: ({ children }: { [key: string]: unknown }) => <div className="select-content-mock">{children as React.ReactNode}</div>,
	SelectItem: ({ children, value }: { [key: string]: unknown }) => (
		<option value={value as string} className="select-item-mock">
			{children as React.ReactNode}
		</option>
	),
	SelectSeparator: ({ children }: { [key: string]: unknown }) => (
		<div className="select-separator-mock">{children as React.ReactNode}</div>
	),
	Button: ({ children, onClick }: { [key: string]: unknown }) => (
		<button onClick={onClick as React.MouseEventHandler<HTMLButtonElement>} className="button-mock">
			{children as React.ReactNode}
		</button>
	),
}))

jest.mock("../TemperatureControl", () => ({
	TemperatureControl: ({ value, onChange }: { [key: string]: unknown }) => (
		<div data-testid="temperature-control">
			<input
				type="range"
				value={(value as number) || 0}
				onChange={(e) => (onChange as ((value: number) => void))?.(parseFloat(e.target.value))}
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
		(modelInfo as { thinking?: boolean })?.thinking ? (
			<div data-testid="thinking-budget" data-provider={provider}>
				<input data-testid="thinking-tokens" value={(apiConfiguration as { modelMaxThinkingTokens?: number })?.modelMaxThinkingTokens} />
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
