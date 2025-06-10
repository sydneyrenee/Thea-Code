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
i18next.use(initReactI18next).init({
	lng: "en",
	fallbackLng: "en",
	debug: false,
	interpolation: {
		escapeValue: false,
	},
	resources: {
		en: {
			chat: translations.en.chat,
			settings: translations.en.settings,
			common: translations.en.common,
		},
		es: {
			chat: translations.es.chat,
		},
	},
})

export function loadTranslations() {
	// Translations are already loaded in the mock
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
