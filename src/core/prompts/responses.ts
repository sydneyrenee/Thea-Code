import * as path from "path"
import type { NeutralTextContentBlock, NeutralImageContentBlock } from "../../shared/neutral-history"
import * as diff from "diff"
import { TheaIgnoreController, LOCK_TEXT_SYMBOL } from "../ignore/TheaIgnoreController"
import { GLOBAL_FILENAMES } from "../../../dist/thea-config"

export const formatResponse = {
	toolDenied: () => `The user denied this operation.`,

	toolDeniedWithFeedback: (feedback?: string) =>
		`The user denied this operation and provided the following feedback:\n<feedback>\n${feedback}\n</feedback>`,

	toolApprovedWithFeedback: (feedback?: string) =>
		`The user approved this operation and provided the following context:\n<feedback>\n${feedback}\n</feedback>`,

	toolError: (error?: string) => `The tool execution failed with the following error:\n<error>\n${error}\n</error>`,

	theaIgnoreError: (path: string) =>
		`Access to ${path} is blocked by the ${GLOBAL_FILENAMES.IGNORE_FILENAME} file settings. You must try to continue in the task without using this file, or ask the user to update the ${GLOBAL_FILENAMES.IGNORE_FILENAME} file.`,

	noToolsUsed: () =>
		`[ERROR] Tool use is mandatory. You did not use a tool in your previous response.
	
	# Task Completion Check
	
	**If you believe you have completed the user's task, you MUST use the <attempt_completion> tool.** Failure to do so will prevent the task from finishing correctly.
	
	# Other Actions
	
	If you require additional information from the user, use the <ask_followup_question> tool.
	If you need to perform other actions to continue the task, use the appropriate tool.
	
	${toolUseInstructionsReminder}
	
	(This is an automated message. Respond with a tool use, not conversationally.)`,

	tooManyMistakes: (feedback?: string) =>
		`You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${feedback}\n</feedback>`,

	missingToolParameterError: (paramName: string) =>
		`Missing value for required parameter '${paramName}'. Please retry with complete response.\n\n${toolUseInstructionsReminder}`,

	invalidMcpToolArgumentError: (serverName: string, toolName: string) =>
		`Invalid JSON argument used with ${serverName} for ${toolName}. Please retry with a properly formatted JSON argument.`,

	toolResult: (text: string, images?: string[]): string | (NeutralTextContentBlock | NeutralImageContentBlock)[] => {
		if (images && images.length > 0) {
			const textBlock: NeutralTextContentBlock = { type: "text", text }
			const imageBlocks: NeutralImageContentBlock[] = formatImagesIntoBlocks(images)
			// Placing images after text leads to better results
			return [textBlock, ...imageBlocks] as (NeutralTextContentBlock | NeutralImageContentBlock)[] // Explicitly cast to union array
		} else {
			return text
		}
	},

	imageBlocks: (images?: string[]): NeutralImageContentBlock[] => {
		return formatImagesIntoBlocks(images)
	},

	formatFilesList: (
		absolutePath: string,
		files: string[],
		didHitLimit: boolean,
		theaIgnoreController: TheaIgnoreController | undefined,
		showTheaIgnoredFiles: boolean,
	): string => {
		const sorted = files
			.map((file) => {
				// convert absolute path to relative path
				const relativePath = path.relative(absolutePath, file).toPosix()
				return file.endsWith("/") ? relativePath + "/" : relativePath
			})
			// Sort so files are listed under their respective directories to make it clear what files are children of what directories. Since we build file list top down, even if file list is truncated it will show directories that cline can then explore further.
			.sort((a, b) => {
				const aParts = a.split("/") // only works if we use toPosix first
				const bParts = b.split("/")
				for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
					if (aParts[i] !== bParts[i]) {
						// If one is a directory and the other isn't at this level, sort the directory first
						if (i + 1 === aParts.length && i + 1 < bParts.length) {
							return -1
						}
						if (i + 1 === bParts.length && i + 1 < aParts.length) {
							return 1
						}
						// Otherwise, sort alphabetically
						return aParts[i].localeCompare(bParts[i], undefined, { numeric: true, sensitivity: "base" })
					}
				}
				// If all parts are the same up to the length of the shorter path,
				// the shorter one comes first
				return aParts.length - bParts.length
			})

		let theaIgnoreParsed: string[] = sorted

		if (theaIgnoreController) {
			theaIgnoreParsed = []
			for (const filePath of sorted) {
				// path is relative to absolute path, not cwd
				// validateAccess expects either path relative to cwd or absolute path
				// otherwise, for validating against ignore patterns like "assets/icons", we would end up with just "icons", which would result in the path not being ignored.
				const absoluteFilePath = path.resolve(absolutePath, filePath)
				const isIgnored = !theaIgnoreController.validateAccess(absoluteFilePath)

				if (isIgnored) {
					// If file is ignored and we're not showing ignored files, skip it
					if (!showTheaIgnoredFiles) {
						continue
					}
					// Otherwise, mark it with a lock symbol
					theaIgnoreParsed.push(LOCK_TEXT_SYMBOL + " " + filePath)
				} else {
					theaIgnoreParsed.push(filePath)
				}
			}
		}
		if (didHitLimit) {
			return `${theaIgnoreParsed.join(
				"\n",
			)}\n\n(File list truncated. Use list_files on specific subdirectories if you need to explore further.)`
		} else if (theaIgnoreParsed.length === 0 || (theaIgnoreParsed.length === 1 && theaIgnoreParsed[0] === "")) {
			return "No files found."
		} else {
			return theaIgnoreParsed.join("\n")
		}
	},

	createPrettyPatch: (filename = "file", oldStr?: string, newStr?: string) => {
		// strings cannot be undefined or diff throws exception
		const patch = diff.createPatch(filename.toPosix(), oldStr || "", newStr || "")
		const lines = patch.split("\n")
		const prettyPatchLines = lines.slice(4)
		return prettyPatchLines.join("\n")
	},
}

// to avoid circular dependency
const formatImagesIntoBlocks = (images?: string[]): NeutralImageContentBlock[] => {
	return images
		? images.map((dataUrl) => {
				// data:image/png;base64,base64string
				const [rest, base64] = dataUrl.split(",")
				const mimeType = rest.split(":")[1].split(";")[0] as
					| "image/jpeg"
					| "image/png"
					| "image/gif"
					| "image/webp" // Ensure it's a valid media type
				return {
					type: "image", // This is the discriminator for NeutralMessageContent
					source: { type: "base64", media_type: mimeType, data: base64 },
				} as NeutralImageContentBlock
			})
		: []
}

const toolUseInstructionsReminder = `# Reminder: Instructions for Tool Use

Tool uses are formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Here's the structure:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

For example:

<attempt_completion>
<result>
I have completed the task...
</result>
</attempt_completion>

Always adhere to this format for all tool uses to ensure proper parsing and execution.`
