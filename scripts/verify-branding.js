const fs = require("fs")
const path = require("path")
const os = require("os")
const { execSync } = require("child_process")

const binDir = path.join(__dirname, "..", "bin")
const tempDirPrefix = path.join(os.tmpdir(), "thea-verify-")
const searchString = "roo"
const searchRegex = /roo[^t]/i // Case-insensitive search for 'roo' NOT followed by 't'

let vsixPath = ""
let foundRoo = false

console.log("Starting branding verification...")

// --- 1. Find the .vsix file ---
try {
	const files = fs.readdirSync(binDir)
	const vsixFile = files.find((file) => file.endsWith(".vsix"))
	if (!vsixFile) {
		console.error(`Error: No .vsix file found in ${binDir}`)
		process.exit(1)
	}
	vsixPath = path.join(binDir, vsixFile)
	console.log(`Found VSIX file: ${vsixPath}`)
} catch (err) {
	console.error(`Error reading bin directory ${binDir}: ${err.message}`)
	process.exit(1)
}

let tempDirPath = ""
try {
	// --- 2. Create temporary directory ---
	tempDirPath = fs.mkdtempSync(tempDirPrefix)
	console.log(`Created temporary directory: ${tempDirPath}`)

	// --- 3. Extract .vsix file ---
	console.log(`Extracting ${vsixPath} to ${tempDirPath}...`)
	// Use unzip command. Ensure it's installed on the system.
	// Extract specifically the 'extension' folder content if possible, or extract all and target 'extension' folder.
	// The '-d' flag specifies the destination directory.
	execSync(`unzip -o "${vsixPath}" -d "${tempDirPath}"`, { stdio: "inherit" }) // Use -o to overwrite without prompt
	console.log("Extraction complete.")

	const extensionDir = path.join(tempDirPath, "extension") // VSIX extracts content into an 'extension' folder

	if (!fs.existsSync(extensionDir)) {
		console.warn(
			`Warning: Expected 'extension' directory not found in extracted VSIX at ${tempDirPath}. Searching root.`,
		)
		// Fallback to searching the root of tempDirPath if 'extension' doesn't exist
		// This might happen with older vsce versions or different packaging structures.
		scanDirectory(tempDirPath)
	} else {
		// --- 4. Recursively scan files ---
		console.log(`Scanning files in ${extensionDir}...`)
		scanDirectory(extensionDir)
	}
} catch (err) {
	console.error(`An error occurred: ${err.message}`)
	process.exitCode = 1 // Indicate error
} finally {
	// --- 5. Cleanup temporary directory ---
}

// --- 7. Report result ---
if (foundRoo) {
	console.error('\nVerification FAILED: Found instances of "roo" (case-insensitive) in the packaged extension.')
	process.exitCode = 1 // Ensure script exits with error code if issues found
} else {
	console.log('\nVerification PASSED: No instances of "roo" (case-insensitive) found.')
}

// --- Helper function to scan directory recursively ---
function scanDirectory(dirPath) {
	const entries = fs.readdirSync(dirPath, { withFileTypes: true })

	for (const entry of entries) {
		const currentPath = path.join(dirPath, entry.name)
		if (entry.isDirectory()) {
			scanDirectory(currentPath)
		} else if (entry.isFile()) {
			// Skip binary files heuristically (e.g., images, fonts)
			const ext = path.extname(entry.name).toLowerCase()
			if (
				![
					".png",
					".jpg",
					".jpeg",
					".gif",
					".webp",
					".svg",
					".ttf",
					".woff",
					".woff2",
					".eot",
					".vsix",
				].includes(ext)
			) {
				try {
					const content = fs.readFileSync(currentPath, "utf8")
					const lines = content.split("\n")
					lines.forEach((line, index) => {
						if (searchRegex.test(line)) {
							foundRoo = true
							// console.warn(`Found "${searchString}" in ${currentPath} (Line ${index + 1}): ${line.trim()}`);
							console.warn(`Found "${searchString}" in ${currentPath} (Line ${index + 1})`)
						}
					})
				} catch (readErr) {
					if (readErr.message.includes("invalid byte sequence")) {
						// console.log(`Skipping binary file (likely): ${currentPath}`);
					} else {
						console.error(`Error reading file ${currentPath}: ${readErr.message}`)
					}
				}
			}
		}
	}
}
