import fs from "fs/promises"
import path from "path"

import { LANGUAGES, isLanguage } from "../../../shared/language"

async function safeReadFile(filePath: string): Promise<string> {
	try {
		const content = await fs.readFile(filePath, "utf-8")
		return content.trim()
	} catch (err) {
		// Safely check if the error has a code property
		const error = err as Error & { code?: string }
		const errorCode = error.code
		
		// Handle ENOENT (file not found) and EISDIR (is a directory) errors by returning empty string
		if (errorCode && ["ENOENT", "EISDIR"].includes(errorCode)) {
			return ""
		}
		
		// For all other errors, rethrow the original error to maintain error type
		throw err
	}
}

export async function loadRuleFiles(cwd: string): Promise<string> {
	// Validate input
	if (!cwd) {
		console.warn("loadRuleFiles called with empty cwd, using current directory")
		cwd = "."
	}

	const ruleFiles = [".Thearules", ".cursorrules", ".windsurfrules"]
	let combinedRules = ""

	for (const file of ruleFiles) {
		try {
			// Safely join paths
			const filePath = path.join(cwd, file)
			const content = await safeReadFile(filePath)
			if (content) {
				combinedRules += `\n# Rules from ${file}:\n${content}\n`
			}
		} catch (err) {
			// Check if this is an expected error type that we should handle
			const error = err as Error & { code?: string }
			const errorCode = error.code
			
			// For ENOENT and EISDIR, just log and continue
			if (errorCode && ["ENOENT", "EISDIR"].includes(errorCode)) {
				console.warn(`Error reading rule file ${file}: ${error.message}`)
				// Continue with other files
			} else {
				// For unexpected errors, rethrow
				throw err
			}
		}
	}
	
	return combinedRules
}

export async function addCustomInstructions(
	modeCustomInstructions: string,
	globalCustomInstructions: string,
	cwd: string,
	mode: string,
	options: { language?: string; theaIgnoreInstructions?: string } = {}, // Rename parameter
): Promise<string> {
	// Validate input
	if (!cwd) {
		console.warn("addCustomInstructions called with empty cwd, using current directory")
		cwd = "."
	}
	
	const sections = []

	// Load mode-specific rules if mode is provided
	let modeRuleContent = ""
	if (mode) {
		try {
			const modeRuleFile = `.Thearules-${mode}`
			const filePath = path.join(cwd, modeRuleFile)
			modeRuleContent = await safeReadFile(filePath)
		} catch (err) {
			// Check if this is an expected error type that we should handle
			const error = err as Error & { code?: string }
			const errorCode = error.code
			
			// For ENOENT and EISDIR, just log and continue
			if (errorCode && ["ENOENT", "EISDIR"].includes(errorCode)) {
				console.warn(`Error reading mode-specific rule file for mode ${mode}: ${error.message}`)
				// Continue with empty mode rule content
			} else {
				// For unexpected errors, rethrow
				throw err
			}
		}
	}

	// Add language preference if provided
	if (options.language) {
		const languageName = isLanguage(options.language) ? LANGUAGES[options.language] : options.language
		sections.push(
			`Language Preference:\nYou should always speak and think in the "${languageName}" (${options.language}) language unless the user gives you instructions below to do otherwise.`,
		)
	}

	// Add global instructions first
	if (typeof globalCustomInstructions === "string" && globalCustomInstructions.trim()) {
		sections.push(`Global Instructions:\n${globalCustomInstructions.trim()}`)
	}

	// Add mode-specific instructions after
	if (typeof modeCustomInstructions === "string" && modeCustomInstructions.trim()) {
		sections.push(`Mode-specific Instructions:\n${modeCustomInstructions.trim()}`)
	}

	// Add rules - include both mode-specific and generic rules if they exist
	const rules = []

	// Add mode-specific rules first if they exist
	if (modeRuleContent && modeRuleContent.trim()) {
		const modeRuleFile = `.Thearules-${mode}`
		rules.push(`# Rules from ${modeRuleFile}:\n${modeRuleContent}`)
	}

	if (options.theaIgnoreInstructions) {
		// Use renamed parameter
		rules.push(options.theaIgnoreInstructions) // Use renamed parameter
	}

	// Add generic rules - let errors propagate up
	const genericRuleContent = await loadRuleFiles(cwd)
	if (genericRuleContent && genericRuleContent.trim()) {
		rules.push(genericRuleContent.trim())
	}

	if (rules.length > 0) {
		sections.push(`Rules:\n\n${rules.join("\n\n")}`)
	}

	const joinedSections = sections.join("\n\n")

	return joinedSections
		? `
====

USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.

${joinedSections}`
		: ""
}
