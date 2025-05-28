import React from "react"
import { Button } from "vscrui"

interface VSCodeButtonLinkProps {
	href: string
	children: React.ReactNode
	onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
	disabled?: boolean
	className?: string
	style?: React.CSSProperties
	title?: string
}

export const VSCodeButtonLink = ({ href, children, onClick, ...props }: VSCodeButtonLinkProps) => {
	const handleClick = () => {
		if (onClick) {
			// Create a synthetic event to pass to the onClick handler
			const syntheticEvent = {
				preventDefault: () => {},
				stopPropagation: () => {},
			} as React.MouseEvent<HTMLButtonElement>
			onClick(syntheticEvent)
		}
	}

	return (
		<a
			href={href}
			style={{
				textDecoration: "none",
				color: "inherit",
			}}>
			<Button onClick={handleClick} {...props}>{children}</Button>
		</a>
	)
}
