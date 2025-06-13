// npx jest src/integrations/terminal/__tests__/TerminalRegistry.test.ts

import { TerminalRegistry } from "../TerminalRegistry"
import { EXTENSION_DISPLAY_NAME } from "../../../../dist/thea-config" // Import branded constant

// Mock vscode.window.createTerminal
const mockCreateTerminal = jest.fn()
jest.mock("vscode", () => ({
	window: {
		createTerminal: (...args: unknown[]) => {
			mockCreateTerminal(...args)
			return {
				exitStatus: undefined,
			}
		},
	},
	ThemeIcon: jest.fn(),
}))

describe("TerminalRegistry", () => {
	beforeEach(() => {
		mockCreateTerminal.mockClear()
	})

	describe("createTerminal", () => {
		it("creates terminal with PAGER set to cat", () => {
			TerminalRegistry.createTerminal("/test/path")

			expect(mockCreateTerminal).toHaveBeenCalledWith({
				cwd: "/test/path",
				name: EXTENSION_DISPLAY_NAME as string,
				iconPath: expect.any(Object) as unknown,
				env: {
					PAGER: "cat",
					PROMPT_COMMAND: "sleep 0.050",
					VTE_VERSION: "0",
				},
			})
		})
	})
})
