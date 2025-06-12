import React from "react"

export const Checkbox = ({ children, onChange, ...props }: { children: React.ReactNode; onChange?: (checked: boolean) => void; [key: string]: unknown }) =>
        React.createElement(
                "label",
                null,
                React.createElement("input", {
                        type: "checkbox",
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked),
                        ...props,
                }),
                children,
        )

export const Dropdown = ({ children, onChange }: { children: React.ReactNode; onChange?: () => void }) =>
	React.createElement("div", { "data-testid": "mock-dropdown", onClick: onChange }, children)

export const Pane = ({ children }: { children: React.ReactNode }) => React.createElement("div", { "data-testid": "mock-pane" }, children)

export const Button = ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
	React.createElement("div", { "data-testid": "mock-button", ...props }, children)

export type DropdownOption = {
	label: string
	value: string
}
