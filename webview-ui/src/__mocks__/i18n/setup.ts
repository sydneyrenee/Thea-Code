import i18next from "i18next"
import { initReactI18next } from "react-i18next"

// Mock translations for testing
const translations: Record<string, Record<string, unknown>> = {
	en: {
		chat: {
			greeting: "What can Thea do for you?",
		},
		settings: {
			autoApprove: {
				title: "Auto-Approve",
			},
		},
		common: {
			notifications: {
				error: "Operation failed: {{message}}",
			},
		},
	},
	es: {
		chat: {
			greeting: "¿Qué puede hacer Thea por ti?",
		},
	},
}

// Initialize i18next for React
// This will be initialized with the VSCode language in TranslationProvider
i18next.use(initReactI18next).init({
	lng: "en", // Default language (will be overridden)
	fallbackLng: "en",
	debug: false,
	interpolation: {
		escapeValue: false, // React already escapes by default
	},
})

export function loadTranslations() {
	// Translations are already loaded in the mock
	Object.entries(translations).forEach(([lang, namespaces]) => {
		try {
			Object.entries(namespaces).forEach(([namespace, resources]) => {
				i18next.addResourceBundle(lang, namespace, resources, true, true)
			})
		} catch (error) {
			console.warn(`Could not load ${lang} translations:`, error)
		}
	})
}

export function addTranslation(language: string, namespace: string, resources: Record<string, unknown>) {
	if (!translations[language]) {
		translations[language] = {}
	}
	translations[language][namespace] = resources

	// Also add to i18next
	i18next.addResourceBundle(language, namespace, resources, true, true)
}

export default i18next
