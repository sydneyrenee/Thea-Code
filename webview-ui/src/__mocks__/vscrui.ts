import React from "react"

export const Checkbox = ({ children, onChange, ...props }: any) =>
        React.createElement(
                "label",
                null,
                React.createElement("input", {
                        type: "checkbox",
                        onChange: (e: any) => onChange?.(e.target.checked),
                        ...props,
                }),
                children,
        )

export const Dropdown = ({ children, onChange }: any) =>
	React.createElement("div", { "data-testid": "mock-dropdown", onClick: onChange }, children)

export const Pane = ({ children }: any) => React.createElement("div", { "data-testid": "mock-pane" }, children)

export const Button = ({ children, ...props }: any) =>
	React.createElement("div", { "data-testid": "mock-button", ...props }, children)

export type DropdownOption = {
	label: string
	value: string
}
