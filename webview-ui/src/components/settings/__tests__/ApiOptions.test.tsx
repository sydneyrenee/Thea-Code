// npx jest src/components/settings/__tests__/ApiOptions.test.ts

import React from "react"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionStateContextProvider } from "@/context/ExtensionStateContext"

import ApiOptions from "../ApiOptions"

// Mock VSCode components
jest.mock("@/components/ui/vscode-components", () => ({
	VSCodeTextField: ({ 
		children, 
		value, 
		onBlur 
	}: { 
		children?: React.ReactNode
		value?: string | number
		onBlur?: (e: React.ChangeEvent<HTMLInputElement>) => void 
	}) => (
		<div>
			{children}
			<input type="text" value={value} onChange={onBlur} />
		</div>
	),
	VSCodeLink: ({ children, href }: { children?: React.ReactNode; href?: string }) => <a href={href}>{children}</a>,
	VSCodeRadio: ({ 
		value, 
		checked 
	}: { 
		value?: string | number
		checked?: boolean 
	}) => (
		<input type="radio" value={value} checked={checked} />
	),
	VSCodeRadioGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	VSCodeButton: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

// Mock other components
jest.mock("vscrui", () => ({
	Checkbox: ({ 
		children, 
		checked, 
		onChange 
	}: { 
		children?: React.ReactNode
		checked?: boolean
		onChange?: (checked: boolean) => void 
	}) => (
		<label>
			<input type="checkbox" checked={checked} onChange={(e) => onChange?.(e.target.checked)} />
			{children}
		</label>
	),
	Button: ({ 
		children, 
		onClick 
	}: { 
		children?: React.ReactNode
		onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void 
	}) => <button onClick={onClick}>{children}</button>,
}))

// Mock @shadcn/ui components
jest.mock("@/components/ui", () => ({
	Select: ({ 
		children, 
		value, 
		onValueChange 
	}: { 
		children?: React.ReactNode
		value?: string
		onValueChange?: (value: string) => void 
	}) => (
		<div className="select-mock">
			<select value={value} onChange={(e) => onValueChange && onValueChange(e.target.value)}>
				{children}
			</select>
		</div>
	),
	SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div className="select-trigger-mock">{children}</div>,
	SelectValue: ({ children }: { children?: React.ReactNode }) => <div className="select-value-mock">{children}</div>,
	SelectContent: ({ children }: { children?: React.ReactNode }) => <div className="select-content-mock">{children}</div>,
	SelectItem: ({ 
		children, 
		value 
	}: { 
		children?: React.ReactNode
		value?: string | number 
	}) => (
		<option value={value} className="select-item-mock">
			{children}
		</option>
	),
	SelectSeparator: ({ children }: { children?: React.ReactNode }) => (
		<div className="select-separator-mock">{children}</div>
	),
	Button: ({ 
		children, 
		onClick 
	}: { 
		children?: React.ReactNode
		onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void 
	}) => (
		<button onClick={onClick} className="button-mock">
			{children}
		</button>
	),
}))

jest.mock("../TemperatureControl", () => ({
	TemperatureControl: ({ 
		value, 
		onChange 
	}: { 
		value?: number
		onChange?: (value: number) => void 
	}) => (
		<div data-testid="temperature-control">
			<input
				type="range"
				value={value || 0}
				onChange={(e) => onChange?.(parseFloat(e.target.value))}
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
	}: {
		apiConfiguration?: { modelMaxThinkingTokens?: number }
		modelInfo?: { thinking?: boolean }
		setApiConfigurationField?: (field: string, value: unknown) => void
	}) =>
		modelInfo?.thinking ? (
			<div data-testid="thinking-budget">
				<input data-testid="thinking-tokens" value={apiConfiguration?.modelMaxThinkingTokens || 0} />
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
