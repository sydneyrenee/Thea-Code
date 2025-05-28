// Support prompts
import * as vscode from "vscode" // Import vscode for Diagnostic type

// Support prompts
export type PromptParams = {
	userInput?: string;
	filePath?: string;
	startLine?: string;
	endLine?: string;
	selectedText?: string;
	terminalContent?: string;
	diagnostics?: vscode.Diagnostic[];
	[key: string]: string | vscode.Diagnostic[] | undefined;
}

const generateDiagnosticText = (diagnostics?: vscode.Diagnostic[]): string => {
	if (!diagnostics?.length) return ""
	return `Current problems detected:\n${diagnostics
		.map((d) => `- [${d.source || "Error"}] ${d.message}${d.code ? ` (${typeof d.code === 'object' ? JSON.stringify(d.code) : String(d.code)})` : ""}`)
		.join("\n")}`
}

export const createPrompt = (template: string, params: PromptParams): string => {
	let result = template
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) {
			// Remove placeholders for undefined values
			result = result.replaceAll(`\${${key}}`, "")
			continue
		}

		if (key === "diagnostics") {
			if (Array.isArray(value)) {
				result = result.replaceAll("${diagnosticText}", generateDiagnosticText(value))
			}
		} else if (typeof value === 'string') {
			result = result.replaceAll(`\${${key}}`, value)
		}
	}

	// Replace any remaining placeholders with empty strings
	result = result.replaceAll(/\${[^}]*}/g, "")

	return result
}

interface SupportPromptConfig {
	template: string
}

const supportPromptConfigs: Record<string, SupportPromptConfig> = {
	ENHANCE: {
		template: `Generate an enhanced version of this prompt (reply with only the enhanced prompt - no conversation, explanations, lead-in, bullet points, placeholders, or surrounding quotes):

\${userInput}`,
	},
	EXPLAIN: {
		template: `Explain the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

Please provide a clear and concise explanation of what this code does, including:
1. The purpose and functionality
2. Key components and their interactions
3. Important patterns or techniques used`,
	},
	FIX: {
		template: `Fix any issues in the following code from file path \${filePath}:\${startLine}-\${endLine}
\${diagnosticText}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

Please:
1. Address all detected problems listed above (if any)
2. Identify any other potential bugs or issues
3. Provide corrected code
4. Explain what was fixed and why`,
	},
	IMPROVE: {
		template: `Improve the following code from file path \${filePath}:\${startLine}-\${endLine}
\${userInput}

\`\`\`
\${selectedText}
\`\`\`

Please suggest improvements for:
1. Code readability and maintainability
2. Performance optimization
3. Best practices and patterns
4. Error handling and edge cases

Provide the improved code along with explanations for each enhancement.`,
	},
	ADD_TO_CONTEXT: {
		template: `\${filePath}:\${startLine}-\${endLine}
\`\`\`
\${selectedText}
\`\`\``,
	},
	TERMINAL_ADD_TO_CONTEXT: {
		template: `\${userInput}
Terminal output:
\`\`\`
\${terminalContent}
\`\`\``,
	},
	TERMINAL_FIX: {
		template: `\${userInput}
Fix this terminal command:
\`\`\`
\${terminalContent}
\`\`\`

Please:
1. Identify any issues in the command
2. Provide the corrected command
3. Explain what was fixed and why`,
	},
	TERMINAL_EXPLAIN: {
		template: `\${userInput}
Explain this terminal command:
\`\`\`
\${terminalContent}
\`\`\`

Please provide:
1. What the command does
2. Explanation of each part/flag
3. Expected output and behavior`,
	},
	NEW_TASK: {
		template: `\${userInput}`,
	},
} as const

type SupportPromptType = keyof typeof supportPromptConfigs

export const supportPrompt = {
	default: Object.fromEntries(Object.entries(supportPromptConfigs).map(([key, config]) => [key, config.template])),
	get: (customSupportPrompts: Record<string, unknown> | undefined, type: SupportPromptType): string => {
		const customTemplate = customSupportPrompts?.[type]
		return typeof customTemplate === 'string' ? customTemplate : supportPromptConfigs[type].template
	},
	create: (type: SupportPromptType, params: PromptParams, customSupportPrompts?: Record<string, unknown>): string => {
		const template = supportPrompt.get(customSupportPrompts, type)
		return createPrompt(template, params)
	},
} as const

export type { SupportPromptType }

export type CustomSupportPrompts = {
	[key: string]: string | undefined
}
