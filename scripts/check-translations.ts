/**
 * Script to verify all translation keys exist in all languages
 * Run with: npx tsx scripts/check-translations.ts
 */

import { TRANSLATIONS } from '../src/lib/language.js';

const LANGUAGES = ['en', 'fr', 'es', 'de'] as const;

function checkTranslations() {
  const errors: string[] = [];

  // Get all keys from English (reference language)
  const enKeys = Object.keys(TRANSLATIONS.en);

  // Check each language has all keys
  for (const lang of LANGUAGES) {
    if (lang === 'en') continue;

    const langKeys = Object.keys(TRANSLATIONS[lang]);

    // Check for missing keys
    for (const key of enKeys) {
      if (!langKeys.includes(key)) {
        errors.push(`Missing key "${key}" in ${lang.toUpperCase()}`);
      }
    }

    // Check for extra keys (might indicate typos)
    for (const key of langKeys) {
      if (!enKeys.includes(key)) {
        errors.push(`Extra key "${key}" in ${lang.toUpperCase()} (not in EN)`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Translation errors found:\n');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error(`\n${errors.length} error(s) found.\n`);
    process.exit(1);
  }

  console.log(`\n✅ All translations valid across ${LANGUAGES.length} languages (${enKeys.length} keys each)\n`);
}

checkTranslations();
