import React from "react"

export const Check = () => React.createElement("div")
export const ChevronsUpDown = () => React.createElement("div")
export const Loader = () => React.createElement("div")
export const X = () => React.createElement("div")
export const Edit = () => React.createElement("div")
export const Database = (props: Record<string, unknown>) =>
	React.createElement("span", { "data-testid": "database-icon", ...props })
