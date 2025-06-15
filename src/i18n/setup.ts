import * as fs from "fs"
import * as path from "path"
import i18next, { Resource } from "i18next"

// Async function to load all translations
async function loadTranslationsAsync(): Promise<Resource> {
	const translations: Resource = {}
	
	try {
		const localesDir = path.join(__dirname, "i18n", "locales")

		try {
			// Find all language directories asynchronously
			const languageDirs = await fs.promises.readdir(localesDir, { withFileTypes: true })

			const languages = languageDirs
				.filter((dirent: fs.Dirent) => dirent.isDirectory())
				.map((dirent: fs.Dirent) => dirent.name)

			// Process all languages in parallel for better performance
			await Promise.all(
				languages.map(async (language: string) => {
					try {
						const langPath = path.join(localesDir, language)

						// Find all JSON files in the language directory
						const files = (await fs.promises.readdir(langPath))
							.filter((file: string) => file.endsWith(".json"))

						// Initialize language in translations object
						if (!translations[language]) {
							translations[language] = {}
						}

						// Process all namespace files in parallel
						await Promise.all(
							files.map(async (file: string) => {
								const namespace = path.basename(file, ".json")
								const filePath = path.join(langPath, file)

								try {
									// Read and parse the JSON file asynchronously
									const content = await fs.promises.readFile(filePath, "utf8")
									const parsedContent = JSON.parse(content) as Record<string, unknown>
									translations[language][namespace] = parsedContent
								} catch (error) {
									console.error(`Error loading translation file ${filePath}:`, error)
								}
							})
						)
					} catch (error) {
						console.error(`Error processing language ${language}:`, error)
					}
				})
			)

			console.log(`Loaded translations for languages: ${Object.keys(translations).join(", ")}`)
		} catch (dirError) {
			console.error(`Error processing directory ${localesDir}:`, dirError)
		}
	} catch (error) {
		console.error("Error loading translations:", error)
	}

	return translations
}

// Async initialization function
async function initializeI18n(): Promise<void> {
	const translations = await loadTranslationsAsync()
	
	await i18next.init({
		lng: "en",
		fallbackLng: "en",
		debug: false,
		resources: translations,
		interpolation: {
			escapeValue: false,
		},
	})
}

// Build translations object
const translations: Resource = {}

// Determine if running in test environment (jest)
const isTestEnv = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined

// Load translations based on environment
if (!isTestEnv) {
	// For non-test environments, use async loading
	// The initialization will be handled by the extension activation
	void initializeI18n().catch((error) => {
		console.error("Failed to initialize i18n asynchronously, falling back to sync:", error)
		// Fallback to synchronous loading for compatibility
		try {
			const localesDir = path.join(__dirname, "i18n", "locales")

			try {
				// Find all language directories
				const languageDirs = fs.readdirSync(localesDir, { withFileTypes: true })

				const languages = languageDirs
					.filter((dirent: fs.Dirent) => dirent.isDirectory())
					.map((dirent: fs.Dirent) => dirent.name)

				// Process each language
				languages.forEach((language: string) => {
					const langPath = path.join(localesDir, language)

					// Find all JSON files in the language directory
					const files = fs.readdirSync(langPath).filter((file: string) => file.endsWith(".json"))

					// Initialize language in translations object
					if (!translations[language]) {
						translations[language] = {}
					}

					// Process each namespace file
					files.forEach((file: string) => {
						const namespace = path.basename(file, ".json")
						const filePath = path.join(langPath, file)

						try {
							// Read and parse the JSON file
							const content = fs.readFileSync(filePath, "utf8")
							const parsedContent = JSON.parse(content) as Record<string, unknown>
							translations[language][namespace] = parsedContent
						} catch (error) {
							console.error(`Error loading translation file ${filePath}:`, error)
						}
					})
				})

				console.log(`Loaded translations for languages: ${Object.keys(translations).join(", ")}`)
			} catch (dirError) {
				console.error(`Error processing directory ${localesDir}:`, dirError)
			}
		} catch (error) {
			console.error("Error loading translations:", error)
		}

		// Initialize i18next with synchronously loaded translations
		void i18next.init({
			lng: "en",
			fallbackLng: "en",
			debug: false,
			resources: translations,
			interpolation: {
				escapeValue: false,
			},
		})
	})
} else {
	// For test environments, use a simpler initialization
	void i18next.init({
		lng: "en",
		fallbackLng: "en",
		debug: false,
		resources: translations,
		interpolation: {
			escapeValue: false,
		},
	})
}

// Export the async initialization function for use in extension activation
export { initializeI18n, loadTranslationsAsync }
export default i18next
