import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { convertTheme } from "monaco-vscode-textmate-theme-converter/lib/cjs"
import type { IVSCodeTheme } from "monaco-vscode-textmate-theme-converter/lib/cjs"
import { EXTENSION_ID } from "../../../dist/thea-config" // Import branded constant

interface StandaloneThemeData {
	inherit: boolean
	base: string
	colors: Record<string, string>
	rules: unknown[]
	encodedTokensColors?: unknown[]
}

const defaultThemes: Record<string, string> = {
	"Default Dark Modern": "dark_modern",
	"Dark+": "dark_plus",
	"Default Dark+": "dark_plus",
	"Dark (Visual Studio)": "dark_vs",
	"Visual Studio Dark": "dark_vs",
	"Dark High Contrast": "hc_black",
	"Default High Contrast": "hc_black",
	"Light High Contrast": "hc_light",
	"Default High Contrast Light": "hc_light",
	"Default Light Modern": "light_modern",
	"Light+": "light_plus",
	"Default Light+": "light_plus",
	"Light (Visual Studio)": "light_vs",
	"Visual Studio Light": "light_vs",
}

type JsonObject = Record<string, unknown>

function parseThemeString(themeString: string | undefined): JsonObject {
	const sanitized = themeString
		?.split("\n")
		.filter((line) => !line.trim().startsWith("//"))
		.join("\n")

	return JSON.parse(sanitized ?? "{}") as JsonObject
}

export async function getTheme(): Promise<StandaloneThemeData | undefined> {
	let currentTheme: string | undefined
	const colorTheme = vscode.workspace.getConfiguration("workbench").get<string>("colorTheme") || "Default Dark Modern"

	try {
		for (let i = vscode.extensions.all.length - 1; i >= 0; i--) {
			if (currentTheme) {
				break
			}
			const extension = vscode.extensions.all[i]
			const pkg = extension.packageJSON as {
				contributes?: { themes?: Array<{ label: string; path: string }> }
			}
			if (pkg.contributes?.themes?.length) {
				for (const theme of pkg.contributes.themes) {
					if (theme.label === colorTheme) {
						const themePath = path.join(extension.extensionPath, theme.path)
						currentTheme = await fs.readFile(themePath, "utf-8")
						break
					}
				}
			}
		}

		if (currentTheme === undefined && defaultThemes[colorTheme]) {
			const filename = `${defaultThemes[colorTheme]}.json`
			currentTheme = await fs.readFile(
				path.join(getExtensionUri().fsPath, "src", "integrations", "theme", "default-themes", filename),
				"utf-8",
			)
		}

		if (!currentTheme) {
			return undefined
		}

		// Strip comments from theme
		let parsed = parseThemeString(currentTheme)

		if (parsed.include) {
			const includeThemeString = await fs.readFile(
				path.join(getExtensionUri().fsPath, "src", "integrations", "theme", "default-themes", parsed.include as string),
				"utf-8",
			)
			const includeTheme = parseThemeString(includeThemeString)
			parsed = mergeJson(parsed, includeTheme)
		}

		const converted = convertTheme(parsed as unknown as IVSCodeTheme) as StandaloneThemeData

		converted.base = ["vs", "hc-black"].includes(converted.base)
			? converted.base
			: colorTheme.includes("Light")
				? "vs"
				: "vs-dark"

		return converted
	} catch (e) {
		console.log("Error loading color theme: ", e)
	}
	return undefined
}

export function mergeJson(
	first: JsonObject,
	second: JsonObject,
	mergeBehavior: "merge" | "overwrite" = "merge",
	mergeKeys?: Record<string, (a: unknown, b: unknown) => boolean>,
): JsonObject {
	const copyOfFirst: JsonObject = JSON.parse(JSON.stringify(first)) as JsonObject

	try {
		for (const key in second) {
			const secondValue = second[key]

			if (!(key in copyOfFirst) || mergeBehavior === "overwrite") {
				// New value
				copyOfFirst[key] = secondValue
				continue
			}

			const firstValue = copyOfFirst[key]
			if (Array.isArray(secondValue) && Array.isArray(firstValue)) {
				// Array
				const mergeFn = mergeKeys?.[key]
				if (typeof mergeFn === "function") {
					// Merge keys are used to determine whether an item from the second object should override one from the first
					const keptFromFirst: unknown[] = []
					const firstArr = firstValue as unknown[]
					const secondArr = secondValue as unknown[]
					firstArr.forEach((item: unknown) => {
						if (!secondArr.some((item2: unknown) => mergeFn(item, item2))) {
							keptFromFirst.push(item)
						}
					})
					copyOfFirst[key] = [...keptFromFirst, ...secondArr]
				} else {
					copyOfFirst[key] = [...(firstValue as unknown[]), ...(secondValue as unknown[])]
				}
			} else if (typeof secondValue === "object" && typeof firstValue === "object" && firstValue !== null && secondValue !== null) {
				// Object
				copyOfFirst[key] = mergeJson(firstValue as JsonObject, secondValue as JsonObject, mergeBehavior)
			} else {
				// Other (boolean, number, string)
				copyOfFirst[key] = secondValue
			}
		}
		return copyOfFirst
	} catch (e) {
		console.error("Error merging JSON", e, copyOfFirst, second)
		return {
			...copyOfFirst,
			...second,
		}
	}
}

function getExtensionUri(): vscode.Uri {
	return vscode.extensions.getExtension(EXTENSION_ID as string)!.extensionUri
}
