import fs from "fs";
import path from "path";

const LOCALES_DIR = path.join("src", "i18n", "locales");
const REFERENCE_LANG = "en";

function getLanguages(): string[] {
  const entries = fs.readdirSync(LOCALES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== REFERENCE_LANG)
    .map((entry) => entry.name)
    .sort();
}

function deepSync(target: any, source: any): boolean {
  let modified = false;
  for (const [key, value] of Object.entries(source)) {
    if (target[key] === undefined) {
      target[key] = value;
      modified = true;
    } else if (typeof value === "object" && value !== null) {
      if (typeof target[key] !== "object" || target[key] === null) {
        target[key] = {};
        modified = true;
      }
      if (deepSync(target[key], value)) {
        modified = true;
      }
    }
  }
  return modified;
}

function syncAll() {
  const enPath = path.join(LOCALES_DIR, REFERENCE_LANG, "translation.json");
  const enContent = fs.readFileSync(enPath, "utf8");
  const enData = JSON.parse(enContent);

  const languages = getLanguages();
  for (const lang of languages) {
    const filePath = path.join(LOCALES_DIR, lang, "translation.json");
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(content);
      if (deepSync(data, enData)) {
        fs.writeFileSync(
          filePath,
          JSON.stringify(data, null, 2) + "\n",
          "utf8",
        );
        console.log(`Synced translations for ${lang}`);
      } else {
        console.log(`No missing keys in ${lang}`);
      }
    } catch (e) {
      console.error(`Failed to process ${lang}:`, e);
    }
  }
}

syncAll();
