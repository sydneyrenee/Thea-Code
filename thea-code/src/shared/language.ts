/**
 * Formats a language code.
 * 
 * @param language The language code to format
 * @returns The formatted language code
 */
export function formatLanguage(language: string): string {
  // In the full implementation, this would format the language code
  // For now, we'll just return the first part of the language code (e.g., 'en' from 'en-US')
  return language.split('-')[0];
}