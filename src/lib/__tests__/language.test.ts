import { describe, it, expect } from 'vitest';
import { TRANSLATIONS } from '../language';

const LANGUAGES = ['en', 'fr', 'es', 'de'] as const;

describe('Translations', () => {
  it('should have all languages defined', () => {
    for (const lang of LANGUAGES) {
      expect(TRANSLATIONS[lang]).toBeDefined();
    }
  });

  it('should have consistent keys across all languages', () => {
    const enKeys = Object.keys(TRANSLATIONS.en).sort();

    for (const lang of LANGUAGES) {
      if (lang === 'en') continue;

      const langKeys = Object.keys(TRANSLATIONS[lang]).sort();

      // Check for missing keys
      const missingKeys = enKeys.filter(key => !langKeys.includes(key));
      expect(missingKeys, `Missing keys in ${lang.toUpperCase()}`).toEqual([]);

      // Check for extra keys
      const extraKeys = langKeys.filter(key => !enKeys.includes(key));
      expect(extraKeys, `Extra keys in ${lang.toUpperCase()}`).toEqual([]);
    }
  });

  it('should not have empty translation values', () => {
    for (const lang of LANGUAGES) {
      const translations = TRANSLATIONS[lang];
      for (const [key, value] of Object.entries(translations)) {
        expect(value, `Empty value for ${key} in ${lang.toUpperCase()}`).not.toBe('');
      }
    }
  });

  it('should have same number of keys in all languages', () => {
    const enCount = Object.keys(TRANSLATIONS.en).length;

    for (const lang of LANGUAGES) {
      const count = Object.keys(TRANSLATIONS[lang]).length;
      expect(count, `${lang.toUpperCase()} has different key count`).toBe(enCount);
    }
  });
});
