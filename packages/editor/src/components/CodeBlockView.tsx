import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useState } from "react";
import { lowlight } from "../editor/extensions";
import { Select } from "./Select";
import { t } from "@scholarkit/i18n";

const LANGUAGE_NAMES: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  graphql: "GraphQL",
  ini: "INI",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  latex: "LaTeX",
  less: "Less",
  lua: "Lua",
  makefile: "Makefile",
  markdown: "Markdown",
  objectivec: "Objective-C",
  perl: "Perl",
  php: "PHP",
  "php-template": "PHP template",
  plaintext: t("Plain text"),
  python: "Python",
  "python-repl": "Python REPL",
  r: "R",
  ruby: "Ruby",
  rust: "Rust",
  scss: "SCSS",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  typescript: "TypeScript",
  vbnet: "VB.NET",
  wasm: "WebAssembly",
  xml: "HTML, XML",
  yaml: "YAML",
};

const LANGUAGES = lowlight
  .listLanguages()
  .map((id) => ({ id, name: LANGUAGE_NAMES[id] ?? id }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** A code block with its language and a Copy button above the code. */
export function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const [copied, setCopied] = useState(false);
  const raw = (node.attrs.language as string | null) ?? "";
  // A language from a file that the list doesn't know stays as written.
  const language = lowlight.registered(raw)
    ? (LANGUAGES.find((l) => l.id === raw)?.id ?? raw)
    : raw;
  const known = LANGUAGES.some((l) => l.id === language);

  const copy = () => {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    };
    navigator.clipboard.writeText(node.textContent).then(done, () => {});
  };

  return (
    <NodeViewWrapper className="code-block">
      <div className="code-bar" contentEditable={false}>
        <Select
          aria-label={t("Language")}
          value={language}
          options={[
            { value: "", label: t("Plain text") },
            ...(!known && language ? [{ value: language, label: language }] : []),
            ...LANGUAGES.filter((l) => l.id !== "plaintext").map((l) => ({
              value: l.id,
              label: l.name,
            })),
          ]}
          onChange={(value) => updateAttributes({ language: value || null })}
        />
        <button type="button" onClick={copy}>
          {copied ? t("Copied") : t("Copy")}
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
