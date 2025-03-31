// scripts/apply-thea-branding.js
const fs = require("fs")
const path = require("path")

console.log("Starting Thea Branding Application...")

// --- Configuration ---
const packageJsonPath = path.join(__dirname, "..", "package.json")
const brandingJsonPath = path.join(__dirname, "..", "branding.json")
const generatedConfigPath = path.join(__dirname, "..", "dist", "thea-config.ts") // Define output path for generated TS config
const contributesTemplatePath = path.join(__dirname, "..", "dist", "contributes.template.json") // Path to the new template
const newVersion = "0.0.1" // Define the starting version for this fork
const templateDirName = "localization-templates" // Directory for original templates
const templateDirPath = path.join(__dirname, "..", templateDirName)
const projectRoot = path.join(__dirname, "..")

// --- Read Files ---
let brandingJson
let packageObj

try {
	console.log(`Reading branding config: ${brandingJsonPath}`)
	brandingJson = JSON.parse(fs.readFileSync(brandingJsonPath, "utf8"))
	console.log("Branding config loaded.")
} catch (err) {
	console.error(`Failed to read branding.json: ${err.message}`)
	process.exit(1)
}

try {
	console.log(`Reading package.json: ${packageJsonPath}`)
	packageObj = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
	console.log("package.json loaded.")
} catch (err) {
	console.error(`Failed to read package.json: ${err.message}`)
	process.exit(1)
}

// --- Backup ---
// Backup original package.json before modification
const packageJsonBackupPath = `${packageJsonPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`
try {
	console.log(`Creating backup: ${packageJsonBackupPath}`)
	fs.copyFileSync(packageJsonPath, packageJsonBackupPath)
	console.log("Backup created.")
} catch (err) {
	console.error(`Failed to create backup: ${err.message}`)
	process.exit(1)
}

// --- Define String Replacements (Old -> New from branding.json) ---
// Sort replacements by key length descending to handle overlapping strings correctly
const rawReplacements = {
	"Roo Code (prev. Roo Cline)": brandingJson.displayName, // Longest first
	"https://github.com/RooVetGit/Roo-Code-Docs": `${brandingJson.repository.org || "sydneyrenee"}/${brandingJson.repository.repo || "Thea-Code"}-Docs`,
	"https://github.com/RooVetGit/Roo-Code/discussions": `${brandingJson.repository.org || "sydneyrenee"}/${brandingJson.repository.repo || "Thea-Code"}/discussions`,
	"https://github.com/RooVetGit/Roo-Code/issues": `${brandingJson.repository.org || "sydneyrenee"}/${brandingJson.repository.repo || "Thea-Code"}/issues`,
	"https://github.com/RooVetGit/Roo-Code": brandingJson.repository.url,
	"RooVetGit/Roo-Code-Docs": `${brandingJson.repository.org || "sydneyrenee"}/${brandingJson.repository.repo || "Thea-Code"}-Docs`,
	"RooVetGit/Roo-Code/discussions": `${brandingJson.repository.org || "sydneyrenee"}/${brandingJson.repository.repo || "Thea-Code"}/discussions`,
	"RooVetGit/Roo-Code/issues": `${brandingJson.repository.org || "sydneyrenee"}/${brandingJson.repository.repo || "Thea-Code"}/issues`,
	"orgs/RooVetGit/projects/1": `orgs/${brandingJson.repository.org || "sydneyrenee"}/projects/1`,
	"https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline": `https://marketplace.visualstudio.com/items?itemName=${brandingJson.publisher}.${brandingJson.name}`,
	"Roo Veterinary Inc.": brandingJson.author.corp || "Solace & Harmony, Inc.",
	RooCodeStorage: `${brandingJson.displayName.replace(/\s+/g, "")}Storage`,
	RooVeterinaryInc: brandingJson.publisher,
	"support@roocode.com": brandingJson.author?.email || "support@example.com",
	"discord.gg/roocode": "discord.gg/thea-placeholder", // Placeholder
	"reddit.com/r/RooCode": "reddit.com/r/thea-placeholder", // Placeholder
	"docs.roocode.com": "docs.thea-placeholder.com", // Placeholder
	"Roo Code": brandingJson.displayName,
	"roo-cline": brandingJson.name,
	"roo code": brandingJson.name,
	// Specific key replacement for global state
	showRooIgnoredFiles: `show${brandingJson.displayName.replace(/\s+/g, "")}IgnoredFiles`,

	roocode: brandingJson.name,
	"roo-code": brandingJson.name,
	"Roo Vet": brandingJson.author.name,
	".rooignore": brandingJson.ignoreFileName || `.${brandingJson.name.toLowerCase()}ignore`,
	".roomodes": brandingJson.modesFileName || `.${brandingJson.name.toLowerCase()}modes`,
	".roo/": `${brandingJson.configDirName || "." + brandingJson.name.toLowerCase()}/`,
	// Type names - apply AFTER general replacements if needed within templates
	// Specific import path replacement for shared types
	"../exports/roo-code": `../exports/${brandingJson.name}`,

	RooCodeAPI: `${brandingJson.aiIdentityName || brandingJson.displayName}CodeAPI`,
	RooCodeEvents: `${brandingJson.aiIdentityName || brandingJson.displayName}CodeEvents`,
	"roo-portal": "thea-portal", // For React portal container
}

// Sort keys by length descending
const stringReplacements = Object.fromEntries(
	Object.entries(rawReplacements).sort(([keyA], [keyB]) => keyB.length - keyA.length),
)
console.log("Defined string replacements (sorted):", stringReplacements)

// --- Update Top-Level Fields in package.json ---
console.log("Updating top-level package.json fields...")
packageObj.name = brandingJson.name
packageObj.displayName = brandingJson.displayName
packageObj.description = brandingJson.description
packageObj.publisher = brandingJson.publisher
packageObj.version = newVersion
packageObj.icon = brandingJson.icon
packageObj.author = brandingJson.author
packageObj.repository = brandingJson.repository
packageObj.homepage = brandingJson.homepage
if (brandingJson.extensionSecretsPrefix) {
	packageObj.extensionSecretsPrefix = brandingJson.extensionSecretsPrefix
}
if (brandingJson.extensionConfigDir) {
	packageObj.extensionConfigDir = brandingJson.extensionConfigDir
} else {
	delete packageObj.extensionConfigDir
}
console.log("Top-level fields updated.")

// --- Apply Selective Recursive Replacement to Contributes in package.json ---
console.log("Applying selective recursive replacements to contributes section...")
if (packageObj.contributes) {
	const sectionsToBrand = ["viewsContainers", "views", "commands", "configuration"]
	sectionsToBrand.forEach((section) => {
		if (packageObj.contributes[section]) {
			packageObj.contributes[section] = replaceStringsRecursively(packageObj.contributes[section])
			console.log(`Branded contributes.${section}`)
		} else {
			console.log(`Skipping contributes.${section} (not found).`)
		}
	})
} else {
	console.log("Skipping selective contributes branding (contributes section not found).")
}
console.log("Selective replacement in contributes done.")

// --- Merge Keywords in package.json ---
console.log("Merging keywords...")
const currentKeywords = new Set(packageObj.keywords || [])
// Use the actual keys from stringReplacements that need removing
const oldKeywords = new Set(["roo code", "roocode", "roo-cline", "Roo Code"])
brandingJson.keywords.forEach((k) => currentKeywords.add(k)) // Add new keywords
oldKeywords.forEach((k) => currentKeywords.delete(k)) // Remove old keywords
packageObj.keywords = Array.from(currentKeywords)
console.log("Keywords merged.")

// --- Recursive String Replacement Function (used for JSON objects) ---
function replaceStringsRecursively(item) {
	if (typeof item === "string") {
		let replacedItem = item
		// Apply replacements case-insensitively for broader matching in JSON values/keys
		// Use sorted replacements
		for (const [oldStr, newStr] of Object.entries(stringReplacements)) {
			const regex = new RegExp(oldStr.replace(/[.*+?^${}()|[\\\]]/g, "\\$&"), "gi")
			replacedItem = replacedItem.replace(regex, newStr)
		}
		return replacedItem
	}
	if (Array.isArray(item)) {
		return item.map(replaceStringsRecursively)
	}
	if (typeof item === "object" && item !== null) {
		const newItem = {}
		for (const key in item) {
			if (Object.prototype.hasOwnProperty.call(item, key)) {
				// Replace in keys as well
				const newKey = replaceStringsRecursively(key)
				const newValue = replaceStringsRecursively(item[key])
				newItem[newKey] = newValue
			}
		}
		return newItem
	}
	return item
}

// --- Recursive helper to replace AI Identity Name ("Roo") in strings ---
// IMPORTANT: This should run *after* replaceStringsRecursively
// to ensure "Roo" is replaced even if it was part of a larger branded string initially.
function replaceAiIdentityNameRecursively(item, aiIdentityName) {
	if (typeof item === "string") {
		// Replace standalone "Roo" with the new AI name, case-sensitive
		// Important: Use word boundary \b to avoid replacing "Roo" within other words like "Room"
		return item.replace(/\bRoo\b/g, aiIdentityName)
	}
	if (Array.isArray(item)) {
		return item.map((subItem) => replaceAiIdentityNameRecursively(subItem, aiIdentityName))
	}
	if (typeof item === "object" && item !== null) {
		const newItem = {}
		for (const key in item) {
			if (Object.prototype.hasOwnProperty.call(item, key)) {
				// Note: We don't replace the key itself here, only the value
				newItem[key] = replaceAiIdentityNameRecursively(item[key], aiIdentityName)
			}
		}
		return newItem
	}
	return item
}

// --- Write updated package.json ---
try {
	console.log(`Writing final branded content to ${packageJsonPath}...`)
	fs.writeFileSync(packageJsonPath, JSON.stringify(packageObj, null, 2))
	console.log("Successfully wrote final branded package.json.")
} catch (err) {
	console.error(`Failed to write updated package.json: ${err.message}`)
	process.exit(1)
}

// --- Update benchmark/package.json ---
console.log("Updating benchmark/package.json...")
const benchmarkPackageJsonPath = path.join(__dirname, "..", "benchmark", "package.json")
try {
	if (fs.existsSync(benchmarkPackageJsonPath)) {
		let benchmarkPackageObj = JSON.parse(fs.readFileSync(benchmarkPackageJsonPath, "utf8"))
		if (benchmarkPackageObj.scripts) {
			const benchmarkReplacements = {
				"roo-code-benchmark": `${brandingJson.name}-benchmark`, // Construct the new benchmark name
			}
			const replaceBenchmarkStrings = (item) => {
				if (typeof item === "string") {
					let replacedItem = item
					for (const [oldStr, newStr] of Object.entries(benchmarkReplacements)) {
						// Case-insensitive replacement for benchmark script
						const regex = new RegExp(oldStr.replace(/[.*+?^${}()|[\\\]]/g, "\\$&"), "gi")
						replacedItem = replacedItem.replace(regex, newStr)
					}
					return replacedItem
				}
				return item // Only replace strings
			}

			const updatedScripts = {}
			for (const key in benchmarkPackageObj.scripts) {
				if (Object.prototype.hasOwnProperty.call(benchmarkPackageObj.scripts, key)) {
					updatedScripts[key] = replaceBenchmarkStrings(benchmarkPackageObj.scripts[key])
				}
			}
			benchmarkPackageObj.scripts = updatedScripts

			fs.writeFileSync(benchmarkPackageJsonPath, JSON.stringify(benchmarkPackageObj, null, 2))
			console.log("Successfully updated benchmark/package.json scripts.")
		} else {
			console.log("Skipping benchmark/package.json update (no scripts section found).")
		}
	} else {
		console.log("Skipping benchmark/package.json update (file not found).")
	}
} catch (err) {
	console.error(`Failed to update benchmark/package.json: ${err.message}`)
	// Don't exit, just log the error and continue
}

// --- Function to generate TypeScript config content ---
function generateTsConfigContent(branding, version) {
	const name = branding.name
	const displayName = branding.displayName
	const publisher = branding.publisher
	const secretsPrefix = branding.extensionSecretsPrefix || `${name}_config_`
	const configDir = branding.configDirName || `.${name.toLowerCase()}` // Use configDirName instead
	const repoUrl = branding.repository?.url || ""
	const homepageUrl = branding.homepage || ""
	const extensionId = `${publisher}.${name}`
	const authorName = branding.author?.name || "Unknown Author"
	const authorEmail = branding.author?.email || "unknown@example.com"
	const ignoreFileName = branding.ignoreFileName || `.${name.toLowerCase()}ignore`
	const modesFileName = branding.modesFileName || `.${name.toLowerCase()}modes`
	const aiIdentityName = branding.aiIdentityName || displayName
	const branchPrefix = branding.branchPrefix || `${name.toLowerCase()}-`
	const configDirName = branding.configDirName || `.${name.toLowerCase()}` // Add configDirName field

	// Recreate constants structure using branding values
	const commands = {
		PLUS_BUTTON: `${name}.plusButtonClicked`,
		MCP_BUTTON: `${name}.mcpButtonClicked`,
		PROMPTS_BUTTON: `${name}.promptsButtonClicked`,
		HISTORY_BUTTON: `${name}.historyButtonClicked`,
		POPOUT_BUTTON: `${name}.popoutButtonClicked`,
		SETTINGS_BUTTON: `${name}.settingsButtonClicked`,
		HELP_BUTTON: `${name}.helpButtonClicked`,
		OPEN_NEW_TAB: `${name}.openInNewTab`,
		EXPLAIN_CODE: `${name}.explainCode`,
		FIX_CODE: `${name}.fixCode`,
		IMPROVE_CODE: `${name}.improveCode`,
		ADD_TO_CONTEXT: `${name}.addToContext`,
		TERMINAL_ADD_TO_CONTEXT: `${name}.terminalAddToContext`,
		TERMINAL_FIX: `${name}.terminalFixCommand`,
		TERMINAL_EXPLAIN: `${name}.terminalExplainCommand`,
		TERMINAL_FIX_CURRENT: `${name}.terminalFixCommandInCurrentTask`,
		TERMINAL_EXPLAIN_CURRENT: `${name}.terminalExplainCommandInCurrentTask`,
		NEW_TASK: `${name}.newTask`,
	}
	const views = {
		SIDEBAR: `${name}.SidebarProvider`,
		TAB_PANEL: `${name}.TabPanelProvider`,
		ACTIVITY_BAR: `${name}-ActivityBar`,
	}
	const config = {
		SECTION: name,
		ALLOWED_COMMANDS: `allowedCommands`,
		VS_CODE_LM_SELECTOR: `vsCodeLmModelSelector`,
		CHECKPOINTS_PREFIX: `${name}-checkpoints`,
	}
	const menuGroups = { AI_COMMANDS: `${displayName} Commands`, NAVIGATION: "navigation" }
	const apiReferences = { REPO_URL: repoUrl, HOMEPAGE: homepageUrl, APP_TITLE: displayName }
	const globalFileNames = { IGNORE_FILENAME: ignoreFileName, MODES_FILENAME: modesFileName }

	const settingKeys = { SHOW_IGNORED_FILES: `show${displayName.replace(/\s+/g, "")}IgnoredFiles` }
	const typeNames = { API: `${aiIdentityName}CodeAPI`, EVENTS: `${aiIdentityName}CodeEvents` }

	// Define functions as strings for TEXT_PATTERNS
	const createRoleDefinitionFunc = `(role: string, modeName?: string): string => { return \`You are \${AI_IDENTITY_NAME}, \${role}\`; }`
	const logPrefixFunc = `(): string => \`\${EXTENSION_DISPLAY_NAME} <Language Model API>:\``
	const textPatternsString = `{ createRoleDefinition: ${createRoleDefinitionFunc}, logPrefix: ${logPrefixFunc} }`

	// Construct the full file content
	return `// Generated by scripts/apply-thea-branding.js - Do not edit manually

 export const EXTENSION_NAME = "${name}";
 export const EXTENSION_DISPLAY_NAME = "${displayName}";
 export const EXTENSION_PUBLISHER = "${publisher}";
 export const EXTENSION_VERSION = "${version}";
 export const EXTENSION_ID = "${extensionId}";
 export const EXTENSION_SECRETS_PREFIX = "${secretsPrefix}";
 export const EXTENSION_CONFIG_DIR = "${configDir}";
 export const CONFIG_DIR_NAME = "${configDirName}"; // Export configDirName constant
 export const REPOSITORY_URL = "${repoUrl}";
 export const HOMEPAGE_URL = "${homepageUrl}";
 export const AUTHOR_NAME = "${authorName}";
 export const AUTHOR_EMAIL = "${authorEmail}";
 export const AI_IDENTITY_NAME = "${aiIdentityName}";
 export const BRANCH_PREFIX = "${branchPrefix}"; // Export BRANCH_PREFIX

 export const COMMANDS = ${JSON.stringify(commands, null, 2)};
export const VIEWS = ${JSON.stringify(views, null, 2)};
export const CONFIG = ${JSON.stringify(config, null, 2)};
export const MENU_GROUPS = ${JSON.stringify(menuGroups, null, 2)};
export const TEXT_PATTERNS = ${textPatternsString};
export const API_REFERENCES = ${JSON.stringify(apiReferences, null, 2)};
export const GLOBAL_FILENAMES = ${JSON.stringify(globalFileNames, null, 2)}; // Add export for global filenames

export const SETTING_KEYS = ${JSON.stringify(settingKeys, null, 2)};
export const TYPE_NAMES = ${JSON.stringify(typeNames, null, 2)};
// Helper function equivalents
export const prefixCommand = (command: string): string => \`\${EXTENSION_NAME}.\${command}\`;
export const brandMessage = (message: string): string => \`\${EXTENSION_DISPLAY_NAME}: \${message}\`;
export const configSection = (): string => CONFIG.SECTION;
// Add other helpers if needed, e.g., getConfig, getTabTitle etc. mirroring branding.ts
`
}

// --- Helper to find .md files ---
function findMdFiles(dir) {
	let results = []
	if (!fs.existsSync(dir)) return results // Skip if dir doesn't exist

	const list = fs.readdirSync(dir)
	list.forEach(function (file) {
		file = path.join(dir, file)
		const stat = fs.statSync(file)
		if (stat && stat.isDirectory()) {
			// Recurse into subdirectories
			results = results.concat(findMdFiles(file))
		} else if (path.extname(file) === ".md") {
			results.push(file)
		}
	})
	return results
}

// --- Helper to find common.json files ---
// Note: This might become redundant if walkAndReplaceTemplates handles JSON files
function findJsonFiles(dir, fileName = "common.json") {
	let results = []
	if (!fs.existsSync(dir)) return results // Skip if dir doesn't exist

	const list = fs.readdirSync(dir)
	list.forEach(function (file) {
		file = path.join(dir, file)
		const stat = fs.statSync(file)
		if (stat && stat.isDirectory()) {
			// Recurse into subdirectories, excluding 'en'
			if (path.basename(file) !== "en") {
				results = results.concat(findJsonFiles(file, fileName))
			}
		} else if (path.basename(file) === fileName) {
			results.push(file)
		}
	})
	return results
}

// --- Recursive File Walker and Replacer (Reads from Templates, Writes to Target) ---
function walkAndReplaceTemplates(templateBaseDir, targetBaseDir, replacements, excludeDirs, includeExtensions) {
	// console.log(`Scanning template directory: ${templateBaseDir}`); // Reduced verbosity
	try {
		if (!fs.existsSync(templateBaseDir)) {
			console.warn(`Template directory not found, skipping: ${templateBaseDir}`)
			return
		}
		let entries = fs.readdirSync(templateBaseDir, { withFileTypes: true }) // Changed const to let for debugging

		for (const entry of entries) {
			const currentTemplatePath = path.join(templateBaseDir, entry.name)
			const relativePath = path.relative(templateDirPath, currentTemplatePath) // Path relative to template root
			let currentTargetPath
			// Prevent duplicating 'locales' in the target path
			if (
				templateBaseDir.includes(path.join(templateDirPath, "locales")) &&
				relativePath.startsWith("locales" + path.sep)
			) {
				// If processing within the locales template subdir, adjust relative path for target
				const adjustedRelativePath = relativePath.substring(relativePath.indexOf(path.sep) + 1)
				currentTargetPath = path.join(targetBaseDir, "locales", adjustedRelativePath)
			} else {
				currentTargetPath = path.join(targetBaseDir, relativePath) // Original calculation
			}

			// --- START ADDED LOGIC ---
			// Special case: Rename roo-code.d.ts to thea-code.d.ts in the target
			if (entry.name === "roo-code.d.ts") {
				currentTargetPath = path.join(path.dirname(currentTargetPath), "thea-code.d.ts")
				// console.log(`Adjusted target path for .d.ts: ${currentTargetPath}`); // Optional debug log
			}
			// --- END ADDED LOGIC ---

			// Skip excluded directories and files based on name
			if (excludeDirs.some((exclude) => entry.name.startsWith(exclude)) || entry.name.includes(".bak-")) {
				continue
			}

			if (entry.isDirectory()) {
				// Recursively process subdirectory
				walkAndReplaceTemplates(
					currentTemplatePath,
					targetBaseDir,
					replacements,
					excludeDirs,
					includeExtensions,
				)
			} else if (entry.isFile()) {
				// Check if it's a file first
				const fileExtension = path.extname(entry.name)
				const shouldInclude = includeExtensions.includes(fileExtension)

				if (shouldInclude) {
					try {
						let templateContent = fs.readFileSync(currentTemplatePath, "utf8")
						let modifiedContent = templateContent // Start with template content
						const aiIdentityName = brandingJson.aiIdentityName || brandingJson.displayName // Get AI name

						if (fileExtension === ".json") {
							// Handle JSON files: Parse, replace recursively, stringify
							let jsonObj = JSON.parse(templateContent)
							jsonObj = replaceStringsRecursively(jsonObj) // Apply general replacements (uses sorted replacements)
							jsonObj = replaceAiIdentityNameRecursively(jsonObj, aiIdentityName) // Apply specific AI name replacement
							modifiedContent = JSON.stringify(jsonObj, null, 2) // Pretty print JSON
						} else {
							// Handle other text files (MD, TS, JS, YAML, etc.)
							// Perform general string replacements (use sorted replacements)
							for (const [oldStr, newStr] of Object.entries(replacements)) {
								// Use sorted `replacements`
								const regex = new RegExp(oldStr.replace(/[.*+?^${}()|[\\\]]/g, "\\$&"), "gi")
								modifiedContent = modifiedContent.replace(regex, newStr)
							}
							// Replace AI Identity Name ("Roo") - case sensitive, whole word
							modifiedContent = modifiedContent.replace(/\bRoo\b/g, aiIdentityName)
						}

						// Only write if content actually changed from the template
						if (modifiedContent !== templateContent) {
							console.log(`Generating branded file: ${currentTargetPath}`)
							// Ensure target directory exists
							const targetDir = path.dirname(currentTargetPath)
							if (!fs.existsSync(targetDir)) {
								fs.mkdirSync(targetDir, { recursive: true })
							}
							fs.writeFileSync(currentTargetPath, modifiedContent, "utf8")
						} else {
							// If no changes, check if target exists. If not, copy template.
							if (!fs.existsSync(currentTargetPath)) {
								console.log(`Copying unmodified template to target: ${currentTargetPath}`)
								const targetDir = path.dirname(currentTargetPath)
								if (!fs.existsSync(targetDir)) {
									fs.mkdirSync(targetDir, { recursive: true })
								}
								fs.copyFileSync(currentTemplatePath, currentTargetPath)
							}
						}
					} catch (fileErr) {
						if (fileErr.code === "ENOENT") {
							// Ignore errors if template file was deleted mid-run
						} else {
							console.error(`Error processing template file ${currentTemplatePath}: ${fileErr.message}`)
						}
					}
				}
			}
		}
	} catch (dirErr) {
		console.error(`Could not read template directory ${templateBaseDir}: ${dirErr.message}`)
	}
}

// --- Generate Branded Files from Templates ---
console.log(`Generating branded files from ${templateDirName}...`)
const templateExcludeDirs = [] // No exclusions needed within templates dir itself for now
const templateIncludeExtensions = [
	".ts",
	".tsx",
	".js",
	".md",
	".mdx",
	".json",
	".yml",
	".yaml",
	".nix",
	".d.ts",
	".html",
] // Added .tsx, .mdx, .html
walkAndReplaceTemplates(
	templateDirPath,
	projectRoot,
	stringReplacements,
	templateExcludeDirs,
	templateIncludeExtensions,
) // Use sorted stringReplacements
console.log("Finished generating branded files from templates.")

// --- Explicitly Rename Generated .d.ts File ---
console.log("Renaming generated .d.ts file...")
const oldDtsPath = path.join(projectRoot, "src", "exports", "roo-code.d.ts") // Path where it might be initially generated if content didn't change significantly
const newDtsPath = path.join(projectRoot, "src", "exports", "thea-code.d.ts")
try {
	if (fs.existsSync(oldDtsPath)) {
		// Only rename if the old file exists and the new one doesn't (or if they are the same file somehow)
		if (!fs.existsSync(newDtsPath) || fs.statSync(oldDtsPath).ino === fs.statSync(newDtsPath).ino) {
			fs.renameSync(oldDtsPath, newDtsPath)
			console.log(`Successfully renamed ${oldDtsPath} to ${newDtsPath}`)
		} else {
			console.log(`Target ${newDtsPath} already exists, possibly generated correctly. Skipping rename.`)
			// Optionally delete the incorrectly named old file if it somehow reappeared
			// fs.unlinkSync(oldDtsPath);
		}
	} else if (fs.existsSync(newDtsPath)) {
		console.log(".d.ts file already named correctly.") // Already generated/renamed correctly, nothing to do
	} else {
		console.warn(`Warning: Generated .d.ts file not found at either expected path, skipping rename.`)
	}
} catch (err) {
	console.error(`Error during .d.ts file rename/check: ${err.message}`)
	// Continue script execution even if rename fails
}

// --- Generate Runtime Config File ---
console.log("Generating runtime configuration file...")
const distDir = path.dirname(generatedConfigPath)
try {
	if (!fs.existsSync(distDir)) {
		fs.mkdirSync(distDir, { recursive: true })
		console.log(`Created directory: ${distDir}`)
	}
	const tsContent = generateTsConfigContent(brandingJson, newVersion)
	fs.writeFileSync(generatedConfigPath, tsContent)
	console.log(`Successfully wrote runtime config to ${generatedConfigPath}`)
} catch (err) {
	console.error(`Failed to generate runtime config file: ${err.message}`)
	process.exit(1)
}

// --- Update i18n JSON files --- // REMOVED - Now handled by template walker

// --- Process Modes Template File ---
console.log("Processing modes template file...")
const modesTemplatePath = path.join(__dirname, "..", "dist", "modes_template.json") // Source from dist
const targetModesPath = path.join(projectRoot, brandingJson.modesFileName || `.${brandingJson.name.toLowerCase()}modes`) // Write to project root

try {
	if (fs.existsSync(modesTemplatePath)) {
		let templateContent = fs.readFileSync(modesTemplatePath, "utf8")
		const aiName = brandingJson.aiIdentityName || brandingJson.displayName // Get AI name

		// Replace placeholder
		templateContent = templateContent.replaceAll("{{AI_IDENTITY_NAME}}", aiName)

		// Write the final modes file
		fs.writeFileSync(targetModesPath, templateContent)
		console.log(`Successfully created/updated modes file at ${targetModesPath}`)
	} else {
		console.warn(`Modes template file not found at ${modesTemplatePath}. Skipping modes file generation.`)
	}
} catch (err) {
	console.error(`Failed to process modes template file: ${err.message}`)
	// Don't exit, just log error
}

console.log("Branding script finished.") // Updated final log message
