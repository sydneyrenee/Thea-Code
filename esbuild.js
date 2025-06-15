const esbuild = require("esbuild")
const fs = require("fs")
const path = require("path")

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: "esbuild-problem-matcher",

	setup(build) {
		build.onStart(() => {
			console.log("[watch] build started")
		})
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`)
				console.error(`    ${location.file}:${location.line}:${location.column}:`)
			})
			console.log("[watch] build finished")
		})
	},
}

const copyWasmFiles = {
	name: "copy-wasm-files",
	setup(build) {
		build.onEnd(() => {
			// tree sitter
			const sourceDir = path.join(__dirname, "node_modules", "web-tree-sitter")
			const targetDir = path.join(__dirname, "dist")

			// Copy tree-sitter.wasm
			fs.copyFileSync(path.join(sourceDir, "tree-sitter.wasm"), path.join(targetDir, "tree-sitter.wasm"))

			// Copy language-specific WASM files
			const languageWasmDir = path.join(__dirname, "node_modules", "tree-sitter-wasms", "out")
			const languages = [
				"typescript",
				"tsx",
				"python",
				"rust",
				"javascript",
				"go",
				"cpp",
				"c",
				"c_sharp",
				"ruby",
				"java",
				"php",
				"swift",
				"kotlin",
			]

			languages.forEach((lang) => {
				const filename = `tree-sitter-${lang}.wasm`
				fs.copyFileSync(path.join(languageWasmDir, filename), path.join(targetDir, filename))
			})
		})
	},
}

// Simple function to copy locale files (async version)
async function copyLocaleFiles() {
	const srcDir = path.join(__dirname, "src", "i18n", "locales")
	const destDir = path.join(__dirname, "dist", "i18n", "locales")
	const outDir = path.join(__dirname, "out", "i18n", "locales")

	// Ensure source directory exists before proceeding
	try {
		await fs.promises.access(srcDir)
	} catch {
		console.warn(`Source locales directory does not exist: ${srcDir}`)
		return // Exit early if source directory doesn't exist
	}

	// Create destination directories
	await fs.promises.mkdir(destDir, { recursive: true })
	try {
		await fs.promises.mkdir(outDir, { recursive: true })
	} catch (e) {}

	// Async function to copy directory recursively
	async function copyDir(src, dest) {
		const entries = await fs.promises.readdir(src, { withFileTypes: true })

		await Promise.all(
			entries.map(async (entry) => {
				const srcPath = path.join(src, entry.name)
				const destPath = path.join(dest, entry.name)

				if (entry.isDirectory()) {
					// Create directory and copy contents
					await fs.promises.mkdir(destPath, { recursive: true })
					await copyDir(srcPath, destPath)
				} else {
					// Copy the file
					await fs.promises.copyFile(srcPath, destPath)
				}
			})
		)
	}

	// Copy files to dist directory
	await copyDir(srcDir, destDir)
	console.log("Copied locale files to dist/i18n/locales")

	// Copy to out directory for debugging
	try {
		await copyDir(srcDir, outDir)
		console.log("Copied locale files to out/i18n/locales")
	} catch (e) {
		console.warn("Could not copy to out directory:", e.message)
	}
}

// Set up file watcher if in watch mode (async version)
async function setupLocaleWatcher() {
	if (!watch) return

	const localesDir = path.join(__dirname, "src", "i18n", "locales")

	// Ensure the locales directory exists before setting up watcher
	try {
		await fs.promises.access(localesDir)
	} catch {
		console.warn(`Cannot set up watcher: Source locales directory does not exist: ${localesDir}`)
		return
	}

	console.log(`Setting up watcher for locale files in ${localesDir}`)

	// Use a debounce mechanism
	let debounceTimer = null
	const debouncedCopy = () => {
		if (debounceTimer) clearTimeout(debounceTimer)
		debounceTimer = setTimeout(async () => {
			console.log("Locale files changed, copying...")
			try {
				await copyLocaleFiles()
			} catch (error) {
				console.error("Error copying locale files:", error)
			}
		}, 300) // Wait 300ms after last change before copying
	}

	// Watch the locales directory
	try {
		fs.watch(localesDir, { recursive: true }, (eventType, filename) => {
			if (filename && filename.endsWith(".json")) {
				console.log(`Locale file ${filename} changed, triggering copy...`)
				debouncedCopy()
			}
		})
		console.log("Watcher for locale files is set up")
	} catch (error) {
		console.error(`Error setting up watcher for ${localesDir}:`, error.message)
	}
}

const copyLocalesFiles = {
	name: "copy-locales-files",
	setup(build) {
		build.onEnd(() => {
			copyLocaleFiles()
		})
	},
}

const extensionConfig = {
	bundle: true,
	minify: production,
	sourcemap: !production,
	logLevel: "silent",
	plugins: [
		copyWasmFiles,
		copyLocalesFiles,
		/* add to the end of plugins array */
		esbuildProblemMatcherPlugin,
		{
			name: "alias-plugin",
			setup(build) {
				build.onResolve({ filter: /^pkce-challenge$/ }, (args) => {
					// Use the browser export path
					return { path: require.resolve("pkce-challenge") }
				})
			},
		},
	],
	entryPoints: ["src/extension.ts"],
	format: "esm",
	sourcesContent: false,
	platform: "node",
	outfile: "dist/extension.js",
	external: [
		"vscode",
		"chromium-bidi",
		"chromium-bidi/lib/cjs/bidiMapper/BidiMapper",
		"chromium-bidi/lib/cjs/cdp/CdpConnection",
		"playwright",
		"playwright-core",
	],
}

async function main() {
	const extensionCtx = await esbuild.context(extensionConfig)

	if (watch) {
		// Start the esbuild watcher
		await extensionCtx.watch()

		// Copy and watch locale files
		console.log("Copying locale files initially...")
		await copyLocaleFiles()

		// Set up the watcher for locale files
		await setupLocaleWatcher()
	} else {
		await extensionCtx.rebuild()
		await extensionCtx.dispose()
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
