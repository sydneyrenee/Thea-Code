import * as vscode from "vscode"
import { CodeActionProvider, ACTION_NAMES } from "../CodeActionProvider"
import { EditorUtils } from "../EditorUtils"

interface MockCodeAction extends vscode.CodeAction {
	title: string
	kind: vscode.CodeActionKind
	command: vscode.Command | undefined
}

interface MockPosition {
	line: number
	character: number
}

interface MockCodeActionContext extends vscode.CodeActionContext {
	diagnostics: vscode.Diagnostic[]
	triggerKind: vscode.CodeActionTriggerKind
	only: vscode.CodeActionKind | undefined // Made explicitly required
}

// Mock VSCode API
jest.mock("vscode", () => {
	const actualVscode: typeof vscode = jest.requireActual("vscode")

	// Mock static methods of Uri directly on the actual Uri class
	actualVscode.Uri.file = jest.fn((path: string) => actualVscode.Uri.file(path))
	actualVscode.Uri.parse = jest.fn((value: string) => actualVscode.Uri.parse(value))
	actualVscode.Uri.joinPath = jest.fn((uri: vscode.Uri, ...paths: string[]) =>
		actualVscode.Uri.joinPath(uri, ...paths),
	)
	actualVscode.Uri.from = jest.fn(
		(components: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }) =>
			actualVscode.Uri.from({
				scheme: components.scheme || "",
				authority: components.authority,
				path: components.path,
				query: components.query,
				fragment: components.fragment,
			}),
	)

	return {
		...actualVscode,
		CodeAction: jest.fn().mockImplementation((title: string, kind: vscode.CodeActionKind) => ({
			title,
			kind,
			command: undefined,
		})),
		CodeActionKind: actualVscode.CodeActionKind, // Return the actual CodeActionKind class
		Range: jest
			.fn()
			.mockImplementation((startLine: number, startChar: number, endLine: number, endChar: number) => ({
				start: { line: startLine, character: startChar } satisfies MockPosition,
				end: { line: endLine, character: endChar } satisfies MockPosition,
			})),
		DiagnosticSeverity: {
			Error: 0,
			Warning: 1,
			Information: 2,
			Hint: 3,
		},
		CodeActionTriggerKind: {
			Invoke: 1,
			Automatic: 2,
		},
		Uri: actualVscode.Uri, // Return the actual Uri class with mocked static methods
	} satisfies Partial<typeof vscode> as typeof vscode
})

// Mock EditorUtils
jest.mock("../EditorUtils", () => ({
	EditorUtils: {
		getEffectiveRange: jest.fn(),
		getFilePath: jest.fn(),
		hasIntersectingRange: jest.fn(),
		createDiagnosticData: jest.fn(),
	},
}))

describe("CodeActionProvider", () => {
	let provider: CodeActionProvider
	let mockDocument: vscode.TextDocument
	let mockRange: vscode.Range
	let mockContext: MockCodeActionContext

	beforeEach(() => {
		provider = new CodeActionProvider()

		// Mock document
		mockDocument = {
			uri: vscode.Uri.file("/test/file.ts"),
			fileName: "/test/file.ts",
			isUntitled: false,
			languageId: "typescript",
			encoding: "utf8", // Added missing property
			version: 1,
			isDirty: false,
			isClosed: false,
			eol: vscode.EndOfLine.LF,
			lineCount: 10,
			getText: jest.fn(() => "mocked text"), // Removed unused 'range' parameter
			lineAt: jest.fn((line: number | vscode.Position) => {
				const lineNumber = typeof line === "number" ? line : line.line
				return {
					text: `mocked line ${lineNumber}`,
					lineNumber: lineNumber,
					range: new vscode.Range(lineNumber, 0, lineNumber, 0), // Minimal valid range
					rangeIncludingLineBreak: new vscode.Range(lineNumber, 0, lineNumber, 0),
					firstNonWhitespaceCharacterIndex: 0,
					isEmptyOrWhitespace: false,
				} as vscode.TextLine
			}),
			offsetAt: jest.fn(),
			positionAt: jest.fn(),
			getWordRangeAtPosition: jest.fn(),
			validateRange: jest.fn(),
			validatePosition: jest.fn(),
			save: jest.fn(),
		} satisfies Partial<vscode.TextDocument> as jest.Mocked<vscode.TextDocument>

		// Mock range
		mockRange = new vscode.Range(0, 0, 0, 10)

		// Mock context
		mockContext = {
			diagnostics: [],
			triggerKind: vscode.CodeActionTriggerKind.Invoke,
			only: undefined, // Added default value for 'only'
		} as MockCodeActionContext

		// Setup default EditorUtils mocks
		;(EditorUtils.getEffectiveRange as jest.Mock).mockReturnValue({
			range: mockRange,
			text: "test code",
		} satisfies { range: vscode.Range; text: string })
		;(EditorUtils.getFilePath as jest.Mock).mockReturnValue("/test/file.ts")
		;(EditorUtils.hasIntersectingRange as jest.Mock).mockReturnValue(true)
		;(EditorUtils.createDiagnosticData as jest.Mock).mockImplementation((d: vscode.Diagnostic) => d)
	})

	describe("provideCodeActions", () => {
		it("should provide explain, improve, fix logic, and add to context actions by default", () => {
			const actions = provider.provideCodeActions(mockDocument, mockRange, mockContext)
			const typedActions = actions as readonly MockCodeAction[]

			expect(typedActions).toHaveLength(7) // 2 explain + 2 fix logic + 2 improve + 1 add to context
			expect(typedActions[0].title).toBe(ACTION_NAMES.ADD_TO_CONTEXT)
			expect(typedActions[1].title).toBe(`${ACTION_NAMES.EXPLAIN} in New Task`)
			expect(typedActions[2].title).toBe(`${ACTION_NAMES.EXPLAIN} in Current Task`)
			expect(typedActions[3].title).toBe(`${ACTION_NAMES.FIX_LOGIC} in New Task`)
			expect(typedActions[4].title).toBe(`${ACTION_NAMES.FIX_LOGIC} in Current Task`)
			expect(typedActions[5].title).toBe(`${ACTION_NAMES.IMPROVE} in New Task`)
			expect(typedActions[6].title).toBe(`${ACTION_NAMES.IMPROVE} in Current Task`)
		})

		it("should provide fix action instead of fix logic when diagnostics exist", () => {
			const diagnostics: vscode.Diagnostic[] = [
				{
					message: "test error",
					severity: vscode.DiagnosticSeverity.Error,
					range: mockRange,
				} satisfies Partial<vscode.Diagnostic>,
			] as vscode.Diagnostic[]
			mockContext.diagnostics = diagnostics

			const actions = provider.provideCodeActions(mockDocument, mockRange, mockContext)
			const typedActions = actions as readonly MockCodeAction[]

			expect(typedActions).toHaveLength(7) // 2 explain + 2 fix + 2 improve + 1 add to context
			expect(typedActions.some((a) => a.title === `${ACTION_NAMES.FIX} in New Task`)).toBe(true)
			expect(typedActions.some((a) => a.title === `${ACTION_NAMES.FIX} in Current Task`)).toBe(true)
			expect(typedActions.some((a) => a.title === `${ACTION_NAMES.FIX_LOGIC} in New Task`)).toBe(false)
			expect(typedActions.some((a) => a.title === `${ACTION_NAMES.FIX_LOGIC} in Current Task`)).toBe(false)
		})

		it("should return empty array when no effective range", () => {
			;(EditorUtils.getEffectiveRange as jest.Mock).mockReturnValue(null)

			const actions = provider.provideCodeActions(mockDocument, mockRange, mockContext)

			expect(actions).toEqual([])
		})

		it("should handle errors gracefully", () => {
			const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
			;(EditorUtils.getEffectiveRange as jest.Mock).mockImplementation(() => {
				throw new Error("Test error")
			})

			const actions = provider.provideCodeActions(mockDocument, mockRange, mockContext)

			expect(actions).toEqual([])
			expect(consoleErrorSpy).toHaveBeenCalledWith("Error providing code actions:", expect.any(Error))

			consoleErrorSpy.mockRestore()
		})
	})
})
