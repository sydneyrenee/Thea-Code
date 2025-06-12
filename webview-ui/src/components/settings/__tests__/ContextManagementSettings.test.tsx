// npx jest src/components/settings/__tests__/ContextManagementSettings.test.ts

import { render, screen, fireEvent } from "@testing-library/react"

import { ContextManagementSettings } from "../ContextManagementSettings"

class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

global.ResizeObserver = MockResizeObserver

jest.mock("@/components/ui", () => ({
	...jest.requireActual("@/components/ui"),
	Slider: ({ value, onValueChange, "data-testid": dataTestId }: { value: number[]; onValueChange: (value: number[]) => void; "data-testid"?: string }) => (
		<input
			type="range"
			value={value[0]}
			onChange={(e) => onValueChange([parseFloat(e.target.value)])}
			data-testid={dataTestId}
		/>
	),
}))

describe("ContextManagementSettings", () => {
	const defaultProps = {
		maxOpenTabsContext: 20,
		maxWorkspaceFiles: 200,
		showTheaIgnoredFiles: false,
		setCachedStateField: jest.fn(),
	}

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("renders all controls", () => {
		render(<ContextManagementSettings {...defaultProps} />)

		// Open tabs context limit
		const openTabsSlider = screen.getByTestId("open-tabs-limit-slider")
		expect(openTabsSlider).toBeInTheDocument()

		// Workspace files limit
		const workspaceFilesSlider = screen.getByTestId("workspace-files-limit-slider")
		expect(workspaceFilesSlider).toBeInTheDocument()

		// Show .thea_ignore'd files
		const showTheaIgnoredFilesCheckbox = screen.getByTestId("show-theaignored-files-checkbox")
		expect(showTheaIgnoredFilesCheckbox).toBeInTheDocument()
		expect(screen.getByTestId("show-theaignored-files-checkbox")).not.toBeChecked()
	})

	it("updates open tabs context limit", () => {
		render(<ContextManagementSettings {...defaultProps} />)

		const slider = screen.getByTestId("open-tabs-limit-slider")
		fireEvent.change(slider, { target: { value: "50" } })

		expect(defaultProps.setCachedStateField).toHaveBeenCalledWith("maxOpenTabsContext", 50)
	})

	it("updates workspace files contextlimit", () => {
		render(<ContextManagementSettings {...defaultProps} />)

		const slider = screen.getByTestId("workspace-files-limit-slider")
		fireEvent.change(slider, { target: { value: "50" } })

		expect(defaultProps.setCachedStateField).toHaveBeenCalledWith("maxWorkspaceFiles", 50)
	})

	it("updates show theaignored files setting", () => {
		render(<ContextManagementSettings {...defaultProps} />)

		const checkbox = screen.getByTestId("show-theaignored-files-checkbox")
		fireEvent.click(checkbox)

		expect(defaultProps.setCachedStateField).toHaveBeenCalledWith("showTheaIgnoredFiles", true)
	})
})
