// Mock implementation for i18n
const i18nMock = {
  t: jest.fn().mockImplementation((key: string, options?: Record<string, any>): string => {
    // Map specific keys to the exact strings expected in tests
    const translationMap: Record<string, string> = {
      "common:confirmation.reset_state": "Are you sure you want to reset all state?",
      "common:answers.yes": "Yes"
    };
    
    // Return the mapped translation or the original key
    return translationMap[key] || key;
  }),
  changeLanguage: jest.fn(),
  getCurrentLanguage: jest.fn().mockReturnValue("en"),
  initializeI18n: jest.fn(),
};

export const t = i18nMock.t;
export const changeLanguage = i18nMock.changeLanguage;
export const getCurrentLanguage = i18nMock.getCurrentLanguage;
export const initializeI18n = i18nMock.initializeI18n;

export default i18nMock;