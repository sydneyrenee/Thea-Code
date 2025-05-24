import React from "react"
import { Button } from "vscrui"

interface VSCodeButtonLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	href: string
	children: React.ReactNode
}

export const VSCodeButtonLink = ({ href, children, ...props }: VSCodeButtonLinkProps) => (
	<a
		href={href}
		style={{
			textDecoration: "none",
			color: "inherit",
		}}>
		<Button {...props}>{children}</Button>
	</a>
)
