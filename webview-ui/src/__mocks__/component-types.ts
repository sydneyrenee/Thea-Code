import React from "react"

// Centralized mock component prop types to resolve test TypeScript errors
export interface MockComponentProps {
	children?: React.ReactNode
	value?: string | number | boolean
	checked?: boolean
	disabled?: boolean
	onClick?: React.MouseEventHandler<HTMLElement>
	onChange?: (...args: unknown[]) => void // Allow flexible onChange types for mocks
	onInput?: (...args: unknown[]) => void // Allow flexible onInput types for mocks
	onValueChange?: (...args: unknown[]) => void // Allow flexible onValueChange types for mocks
	onKeyDown?: React.KeyboardEventHandler<HTMLElement>
	onBlur?: (...args: unknown[]) => void
	placeholder?: string
	href?: string
	dataTestId?: string
	appearance?: string
	className?: string
	[key: string]: unknown // Allow additional props for flexibility
}

// Helper type for mock component functions
export type MockComponent = (props: MockComponentProps) => React.ReactElement
