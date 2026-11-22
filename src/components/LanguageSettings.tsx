import { useState } from "react";
import {
  LANGUAGES,
  PSEUDO_LANGUAGE,
  resolveLanguage,
  savedLanguage,
  SYSTEM,
  t,
} from "@scholarkit/i18n";
import { languageCodes, switchLanguage } from "@/lib/languages";

const FIELD =
  "mt-2 h-7 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-tint-edge";

/** A language's own name, for the list and the system choice. */
function nameOf(code: string): string {
  if (code === PSEUDO_LANGUAGE.code) return PSEUDO_LANGUAGE.name;
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * The interface language: the device's, or one picked here. Shown once a
 * second language ships, and in development with the pseudo-language.
 */
export function LanguageSettings() {
  const [value, setValue] = useState(savedLanguage);
  const [problem, setProblem] = useState<string | null>(null);
  if (languageCodes.length < 2) return null;
  const system = nameOf(resolveLanguage(SYSTEM, navigator.languages, languageCodes));

  const choose = (next: string) => {
    if (next === value) return;
    setValue(next);
    switchLanguage(next).catch((error: unknown) => {
      setValue(value);
      setProblem(messageOf(error));
    });
  };

  return (
    <section className="mb-5">
      <h3 className="text-[13px] font-medium">{t("Interface language")}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t(
          "Menus, buttons and messages. Your pages keep their own language. Cursive reloads to switch.",
        )}
      </p>
      <select
        id="interface-language"
        className={FIELD}
        value={value}
        onChange={(event) => choose(event.target.value)}
      >
        <option value={SYSTEM}>{t("System ({language})", { language: system })}</option>
        {languageCodes.map((code) => (
          <option key={code} value={code} lang={code}>
            {nameOf(code)}
          </option>
        ))}
      </select>
      {problem && <p className="mt-2 text-xs text-destructive">{problem}</p>}
    </section>
  );
}
