// scripts/apply-thea-branding.js
const fs = require("fs")
const path = require("path")

console.log("Starting Thea Branding Application (In-Place)...")

// --- Configuration ---
const packageJsonPath = path.join(__dirname, "..", "package.json")
const brandingJsonPath = path.join(__dirname, "..", "branding.json")
const generatedConfigPath = path.join(__dirname, "..", "dist", "thea-config.ts")
const projectRoot = path.join(__dirname, "..")
const srcDir = path.join(projectRoot, "src")
const webviewUiDir = path.join(projectRoot, "webview-ui", "src")
const benchmarkDir = path.join(projectRoot, "benchmark", "src")
const e2eDir = path.join(projectRoot, "e2e", "src")
const localesDir = path.join(projectRoot, "locales") // For top-level MD files in locale folders
const rootFiles = [
	// Specific root-level files to process
	// path.join(projectRoot, ".github", "ISSUE_TEMPLATE", "config.yml"), // Removed
	// path.join(projectRoot, ".github", "pull_request_template.md"), // Removed
	// path.join(projectRoot, ".husky", "pre-commit"), // Removed
	path.join(projectRoot, "CHANGELOG.md"),
	path.join(projectRoot, "LICENSE"), // Check if branding needed here
	path.join(projectRoot, "README.md"),
	path.join(projectRoot, "flake.nix"),
	path.join(projectRoot, "scripts", "generate-types.mts"),
	path.join(projectRoot, "webview-ui", "index.html"),
]

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

// Helper to extract org/repo from URL
function getOrgRepo(url) {
	try {
		const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/)
		if (match) {
			return { org: match[1], repo: match[2] }
		}
	} catch (e) {
		/* ignore errors */
	}
	return { org: "sydneyrenee", repo: "Thea-Code" } // Fallback
}
const { org: repoOrg, repo: repoName } = getOrgRepo(brandingJson.repository?.url)

try {
	console.log(`Reading package.json: ${packageJsonPath}`)
	packageObj = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
	console.log("package.json loaded.")
} catch (err) {
	console.error(`Failed to read package.json: ${err.message}`)
	process.exit(1)
}

// --- Backup ---
const packageJsonBackupPath = `${packageJsonPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`
try {
	console.log(`Creating backup: ${packageJsonBackupPath}`)
	fs.copyFileSync(packageJsonPath, packageJsonBackupPath)
	console.log("Backup created.")
} catch (err) {
	console.error(`Failed to create backup: ${err.message}`)
	process.exit(1)
}

// --- Define String Replacements (Old -> New, sourced DIRECTLY from branding.json) ---
const showIgnoredFilesKey = `show${brandingJson.displayName.replace(/\s+/g, "")}IgnoredFiles`

const rawReplacements = {
	// URLs first to handle full path before partials
	"https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline": `https://marketplace.visualstudio.com/items?itemName=${brandingJson.publisher}.${brandingJson.name}`,
	"https://github.com/RooVetGit/Roo-Code": brandingJson.repository.url,
	"github.com/RooVetGit/thea-code": `github.com/${repoOrg}/${repoName}`, // Specific pattern from i18n files
	"RooVetGit/Roo-Code": `${repoOrg}/${repoName}`, // GitHub path fragment
	RooVetGit: repoOrg, // Organization name

	// Core Branding
	"roo-cline": brandingJson.name,
	"roo-code": brandingJson.name,
	"Roo Code": brandingJson.displayName,
	RooCodeStorage: `${brandingJson.displayName.replace(/\s+/g, "")}Storage`, // Derived but necessary for JSON values
	"roo code": brandingJson.name, // Lowercase variation if needed
	RooCodeAPI: brandingJson.apiTypeName,
	RooCodeEvents: brandingJson.eventsTypeName,
	RooVeterinaryInc: brandingJson.publisher,
	"Roo Vet": brandingJson.author.name, // Specific author name replacement
	"support@roocode.com": brandingJson.author.email,
	"discord.gg/roocode": brandingJson.discordUrl,
	"reddit.com/r/RooCode": brandingJson.redditUrl,

	// Config/Ignore Files & Dirs
	".rooignore": brandingJson.ignoreFileName,
	".roomodes": brandingJson.modesFileName,
	".roo/": `${brandingJson.configDirName}/`,
	rooignore_error: brandingJson.ignoreErrorIdentifier,
	rooIgnoreContent: brandingJson.ignoreContentVarName,
	rooIgnoreParsed: brandingJson.ignoreParsedVarName,
	RooIgnoreController: brandingJson.ignoreControllerClassName,
	'"rooignore"': '"ignoreFileSetting"', // Explicitly replace the JSON key string

	// Identifiers
	roo_cline_config_: brandingJson.extensionSecretsPrefix, // For secrets prefix in tests
	rooWantsToUse: "aiWantsToUse", // i18n key rename

	// Specific File/Key Names
	"roo-code-settings.json": brandingJson.settingsFileName,
	showRooIgnoredFiles: showIgnoredFilesKey, // Setting key

	// UI/Misc
	"roo-portal": brandingJson.portalName,

	// Standalone AI Name (Whole word, case-sensitive) - applied separately
	// Add other direct mappings as needed
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
packageObj.icon = brandingJson.icon
packageObj.author = brandingJson.author
packageObj.repository = brandingJson.repository
packageObj.homepage = brandingJson.homepage
if (brandingJson.extensionSecretsPrefix) {
	packageObj.extensionSecretsPrefix = brandingJson.extensionSecretsPrefix
}
const newVersion = packageObj.version // Keep version from existing package.json
// Removed extensionConfigDir update as it's not standard

console.log("Top-level fields updated.")

// --- Recursive String Replacement Function ---
function replaceStringsRecursively(item, replacements, aiIdentityName) {
	if (typeof item === "string") {
		let replacedItem = item
		// Apply general replacements first
		for (const [oldStr, newStr] of Object.entries(replacements)) {
			// Escape special regex characters in the old string
			const escapedOldStr = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
			const regex = new RegExp(escapedOldStr, "gi") // Use escaped string
			// Ensure newStr is a string before replacing
			const replacementString = typeof newStr === "string" ? newStr : String(newStr)
			replacedItem = replacedItem.replace(regex, replacementString)
		}
		// Apply standalone AI name replacement last (whole word, case-sensitive)
		replacedItem = replacedItem.replace(/\bRoo\b/g, aiIdentityName)
		return replacedItem
	}
	if (Array.isArray(item)) {
		return item.map((subItem) => replaceStringsRecursively(subItem, replacements, aiIdentityName))
	}
	if (typeof item === "object" && item !== null) {
		const newItem = {}
		for (const key in item) {
			if (Object.prototype.hasOwnProperty.call(item, key)) {
				// Replace in keys as well
				const newKey = replaceStringsRecursively(key, replacements, aiIdentityName) // Recursively replace key
				const newValue = replaceStringsRecursively(item[key], replacements, aiIdentityName)
				newItem[newKey] = newValue
			}
		}
		return newItem
	}
	return item
}

// --- Apply Selective Recursive Replacement to Contributes in package.json ---
console.log("Applying selective recursive replacements to contributes section...")
if (packageObj.contributes) {
	const sectionsToBrand = ["viewsContainers", "views", "commands", "configuration", "submenus", "menus"]
	sectionsToBrand.forEach((section) => {
		if (packageObj.contributes[section]) {
			packageObj.contributes[section] = replaceStringsRecursively(
				packageObj.contributes[section],
				stringReplacements,
				brandingJson.aiIdentityName,
			)
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
const oldKeywords = new Set(["roo code", "roocode", "roo-cline", "Roo Code", "Roo Vet", "cline"]) // Removed 'cline' as well
brandingJson.keywords.forEach((k) => currentKeywords.add(k))
oldKeywords.forEach((k) => currentKeywords.delete(k))
packageObj.keywords = Array.from(currentKeywords)
console.log("Keywords merged.")

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
			// Only replace the benchmark script name if necessary
			const benchmarkReplacements = {
				"roo-code-benchmark": `${brandingJson.name}-benchmark`,
			}
			const replaceBenchmarkStrings = (item) => {
				if (typeof item === "string") {
					let replacedItem = item
					for (const [oldStr, newStr] of Object.entries(benchmarkReplacements)) {
						const escapedOldStr = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
						const regex = new RegExp(escapedOldStr, "gi")
						replacedItem = replacedItem.replace(regex, newStr)
					}
					return replacedItem
				}
				return item
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
}

// --- Function to generate TypeScript config content ---
function generateTsConfigContent(branding, version) {
	const name = branding.name
	const displayName = branding.displayName
	const publisher = branding.publisher
	const secretsPrefix = branding.extensionSecretsPrefix
	const configDir = branding.configDirName
	const repoUrl = branding.repository?.url
	const homepageUrl = branding.homepage
	const extensionId = `${publisher}.${name}`
	const authorName = branding.author?.name
	const authorEmail = branding.author?.email
	const ignoreFileName = branding.ignoreFileName
	const modesFileName = branding.modesFileName
	const aiIdentityName = branding.aiIdentityName
	const aiIdentityNameLowercase = branding.aiIdentityNameLowercase // New
	const branchPrefix = branding.branchPrefix
	const configDirName = branding.configDirName
	const settingsFileName = branding.settingsFileName // New
	const ignoreErrorIdentifier = branding.ignoreErrorIdentifier // New
	const ignoreContentVarName = branding.ignoreContentVarName // New
	const ignoreParsedVarName = branding.ignoreParsedVarName // New
	const ignoreControllerClassName = branding.ignoreControllerClassName // New
	const apiTypeName = branding.apiTypeName // New
	const eventsTypeName = branding.eventsTypeName // New
	const portalName = branding.portalName // New
	const discordUrl = branding.discordUrl || "" // New with fallback
	const redditUrl = branding.redditUrl || "" // New with fallback
	const showIgnoredFilesSettingKey = `show${displayName.replace(/\s+/g, "")}IgnoredFiles` // Derived

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
	// Updated apiReferences to include discord and reddit URLs
	const apiReferences = {
		REPO_URL: repoUrl,
		HOMEPAGE: homepageUrl,
		APP_TITLE: displayName,
		DISCORD_URL: discordUrl,
		REDDIT_URL: redditUrl,
	}
	const globalFileNames = { IGNORE_FILENAME: ignoreFileName, MODES_FILENAME: modesFileName }

	const settingKeys = { SHOW_IGNORED_FILES: showIgnoredFilesSettingKey }
	const typeNames = { API: apiTypeName, EVENTS: eventsTypeName }

	const createRoleDefinitionFunc = `(role: string, modeName?: string): string => { return \`You are \${AI_IDENTITY_NAME}, \${role}\`; }`
	const logPrefixFunc = `(): string => \`\${EXTENSION_DISPLAY_NAME} <Language Model API>:\``
	const textPatternsString = `{ createRoleDefinition: ${createRoleDefinitionFunc}, logPrefix: ${logPrefixFunc} }`

	// Add new constants
	const specificStrings = {
		AI_IDENTITY_NAME_LOWERCASE: aiIdentityNameLowercase,
		IGNORE_ERROR_IDENTIFIER: ignoreErrorIdentifier,
		IGNORE_CONTENT_VAR_NAME: ignoreContentVarName,
		IGNORE_PARSED_VAR_NAME: ignoreParsedVarName,
		IGNORE_CONTROLLER_CLASS_NAME: ignoreControllerClassName,
		SETTINGS_FILE_NAME: settingsFileName,
		PORTAL_NAME: portalName,
	}

	return `// Generated by scripts/apply-thea-branding.js - Do not edit manually

 export const EXTENSION_NAME = "${name}";
 export const EXTENSION_DISPLAY_NAME = "${displayName}";
 export const EXTENSION_PUBLISHER = "${publisher}";
 export const EXTENSION_VERSION = "${version}";
 export const EXTENSION_ID = "${extensionId}";
 export const EXTENSION_SECRETS_PREFIX = "${secretsPrefix}";
 export const EXTENSION_CONFIG_DIR = "${configDir}";
 export const CONFIG_DIR_NAME = "${configDirName}";
 export const REPOSITORY_URL = "${repoUrl}";
 export const HOMEPAGE_URL = "${homepageUrl}";
 export const AUTHOR_NAME = "${authorName}";
 export const AUTHOR_EMAIL = "${authorEmail}";
 export const AI_IDENTITY_NAME = "${aiIdentityName}";
 export const BRANCH_PREFIX = "${branchPrefix}";

 export const COMMANDS = ${JSON.stringify(commands, null, 2)};
export const VIEWS = ${JSON.stringify(views, null, 2)};
export const CONFIG = ${JSON.stringify(config, null, 2)};
export const MENU_GROUPS = ${JSON.stringify(menuGroups, null, 2)};
export const TEXT_PATTERNS = ${textPatternsString};
export const API_REFERENCES = ${JSON.stringify(apiReferences, null, 2)}; // Updated
export const GLOBAL_FILENAMES = ${JSON.stringify(globalFileNames, null, 2)};
export const SPECIFIC_STRINGS = ${JSON.stringify(specificStrings, null, 2)};

export const SETTING_KEYS = ${JSON.stringify(settingKeys, null, 2)};
export const TYPE_NAMES = ${JSON.stringify(typeNames, null, 2)};
// Helper function equivalents
export const prefixCommand = (command: string): string => \`\${EXTENSION_NAME}.\${command}\`;
export const brandMessage = (message: string): string => \`\${EXTENSION_DISPLAY_NAME}: \${message}\`;
export const configSection = (): string => CONFIG.SECTION;
// Add other helpers if needed
`
}

// --- Recursive File Walker and In-Place Replacer ---
function walkAndReplaceInPlace(dir, replacements, aiIdentityName, excludeDirs, includeExtensions) {
	try {
		if (!fs.existsSync(dir)) {
			console.warn(`Directory not found, skipping: ${dir}`)
			return
		}
		let entries = fs.readdirSync(dir, { withFileTypes: true })

		for (const entry of entries) {
			const currentPath = path.join(dir, entry.name)

			// Skip excluded directories and files based on name
			if (excludeDirs.some((exclude) => entry.name.startsWith(exclude)) || entry.name.includes(".bak-")) {
				continue
			}

			// Skip node_modules and dist directories
			if (
				entry.isDirectory() &&
				(entry.name === "node_modules" || entry.name === "dist" || entry.name === "out")
			) {
				// console.log(`Skipping directory: ${currentPath}`) // Reduce noise
				continue
			}

			if (entry.isDirectory()) {
				walkAndReplaceInPlace(currentPath, replacements, aiIdentityName, excludeDirs, includeExtensions)
			} else if (entry.isFile()) {
				const fileExtension = path.extname(entry.name)
				if (includeExtensions.includes(fileExtension)) {
					applyReplacementsToFile(currentPath, replacements, aiIdentityName)
				}
			}
		}
	} catch (dirErr) {
		console.error(`Could not read directory ${dir}: ${dirErr.message}`)
	}
}

// --- Function to Apply Replacements to a Single File (In-Place) ---
function applyReplacementsToFile(filePath, replacements, aiIdentityName) {
	try {
		// console.log(`Attempting to process: ${filePath}`); // Add logging
		let originalContent = fs.readFileSync(filePath, "utf8")
		let modifiedContent = originalContent
		const fileExtension = path.extname(filePath)

		if (fileExtension === ".json") {
			// console.log(`[JSON PROC] Processing: ${filePath}`); // Debug log
			try {
				let jsonObj = JSON.parse(modifiedContent)
				// Ensure recursive replacement happens correctly
				jsonObj = replaceStringsRecursively(jsonObj, replacements, aiIdentityName)
				modifiedContent = JSON.stringify(jsonObj, null, 2) // Pretty print JSON
			} catch (jsonErr) {
				console.warn(`[JSON PROC] Skipping non-standard JSON file ${filePath}: ${jsonErr.message}`)
				return // Skip modification if JSON parsing fails
			}
		} else {
			// Handle other text files (MD, HTML, etc.)
			// Apply general replacements first
			for (const [oldStr, newStr] of Object.entries(replacements)) {
				const escapedOldStr = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
				const regex = new RegExp(escapedOldStr, "gi")
				const replacementString = typeof newStr === "string" ? newStr : String(newStr)
				modifiedContent = modifiedContent.replace(regex, replacementString)
			}
			// Apply standalone AI name replacement last (whole word, case-sensitive)
			modifiedContent = modifiedContent.replace(/\bRoo\b/g, aiIdentityName)
		}

		// Only write if content actually changed
		if (modifiedContent !== originalContent) {
			console.log(`Applying branding to file (in-place): ${filePath}`) // Keep this log
			fs.writeFileSync(filePath, modifiedContent, "utf8")
		}
		// else { // Optional: Log files that were processed but unchanged
		//     console.log(`No changes needed for: ${filePath}`);
		// }
	} catch (fileErr) {
		console.error(`Error processing file ${filePath}: ${fileErr.message}`)
	}
}

// --- Apply In-Place Branding ---
console.log(`Applying branding in-place to project files...`)
const excludeDirs = [".git", "node_modules", "dist", "out", "assets", "audio"]
const includeExtensions = [".md", ".mdx", ".json", ".html"]

// Process main source directories (excluding i18n initially)
const mainSrcExclude = [...excludeDirs, "i18n"] // Temporarily exclude i18n
console.log("--- Processing srcDir (excluding i18n) ---")
walkAndReplaceInPlace(srcDir, stringReplacements, brandingJson.aiIdentityName, mainSrcExclude, includeExtensions)
console.log("--- Processing webviewUiDir (excluding i18n) ---")
walkAndReplaceInPlace(webviewUiDir, stringReplacements, brandingJson.aiIdentityName, mainSrcExclude, includeExtensions) // Assuming webview also has i18n
// walkAndReplaceInPlace(benchmarkDir, stringReplacements, brandingJson.aiIdentityName, excludeDirs, includeExtensions); // Keep commented if not needed
// walkAndReplaceInPlace(e2eDir, stringReplacements, brandingJson.aiIdentityName, excludeDirs, includeExtensions); // Keep commented if not needed

// Explicitly process i18n JSON files in src and webview-ui
const srcI18nDir = path.join(srcDir, "i18n", "locales")
const webviewI18nDir = path.join(webviewUiDir, "i18n", "locales")

console.log("--- Explicitly processing i18n JSON files ---")
;[srcI18nDir, webviewI18nDir].forEach((i18nDir) => {
	if (fs.existsSync(i18nDir)) {
		fs.readdirSync(i18nDir).forEach((langCode) => {
			const langDir = path.join(i18nDir, langCode)
			// Check if langDir is actually a directory before proceeding
			if (fs.existsSync(langDir) && fs.statSync(langDir).isDirectory()) {
				const commonJsonPath = path.join(langDir, "common.json")
				if (fs.existsSync(commonJsonPath)) {
					applyReplacementsToFile(commonJsonPath, stringReplacements, brandingJson.aiIdentityName)
				}
				// Add other specific json files if needed, e.g., chat.json, settings.json
				const otherJsonFiles = fs.readdirSync(langDir).filter((f) => f.endsWith(".json") && f !== "common.json")
				otherJsonFiles.forEach((jsonFile) => {
					applyReplacementsToFile(
						path.join(langDir, jsonFile),
						stringReplacements,
						brandingJson.aiIdentityName,
					)
				})
			} else if (langCode !== "locales") {
				// Avoid warning about the nested 'locales' folder itself
				console.warn(`Expected language directory not found or is not a directory: ${langDir}`)
			}
		})
	} else {
		console.log(`Directory not found, skipping: ${i18nDir}`)
	}
})

// Process locale MD files
try {
	if (fs.existsSync(localesDir)) {
		const localeFolders = fs
			.readdirSync(localesDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => path.join(localesDir, dirent.name))

		localeFolders.forEach((folder) => {
			const mdFiles = fs
				.readdirSync(folder)
				.filter((file) => file.endsWith(".md"))
				.map((file) => path.join(folder, file))
			mdFiles.forEach((mdFile) =>
				applyReplacementsToFile(mdFile, stringReplacements, brandingJson.aiIdentityName),
			)
		})
		console.log("Processed locale MD files.")
	} else {
		console.log("Locales directory not found, skipping locale MD processing.")
	}
} catch (err) {
	console.error(`Error processing locale MD files: ${err.message}`)
}

// Process specific root files
rootFiles.forEach((filePath) => {
	// Check if path exists before processing
	if (filePath && fs.existsSync(filePath)) {
		applyReplacementsToFile(filePath, stringReplacements, brandingJson.aiIdentityName)
	} else if (filePath) {
		// Only warn if filePath was defined
		// console.warn(`Root file not found, skipping: ${filePath}`) // Reduce noise
	}
})

console.log("Finished applying in-place branding.")

// --- Generate Runtime Config File ---
console.log("Generating runtime configuration file...")
const distDir = path.dirname(generatedConfigPath)
try {
	if (!fs.existsSync(distDir)) {
		fs.mkdirSync(distDir, { recursive: true })
		console.log(`Created directory: ${distDir}`)
	}
	const tsContent = generateTsConfigContent(brandingJson, newVersion) // Use newVersion from package.json
	fs.writeFileSync(generatedConfigPath, tsContent)
	console.log(`Successfully wrote runtime config to ${generatedConfigPath}`)
} catch (err) {
	console.error(`Failed to generate runtime config file: ${err.message}`)
	process.exit(1)
}

// --- Process Modes Template File --- REMOVED

console.log("Branding script finished.")
