import { LayoutGrid } from "lucide-react";
import { useState } from "react";
import {
  type TemplateTile,
  TemplateTiles,
} from "@scholarkit/editor/components/StartPage";
import { TEMPLATES } from "@/templates";
import { TemplateDialog } from "./TemplateDialog";
import { t } from "@scholarkit/i18n";

/** A new project with no template: one empty page. */
export const BLANK = "blank";

/** The templates with a tile of their own; the rest are under More templates…. */
const FEATURED = ["lecture-notes", "research-paper", "lecture-slides", "lab-report"];

const tileOf = (id: string): TemplateTile => {
  const template = TEMPLATES.find((item) => item.id === id)!;
  return {
    id,
    name: template.name,
    look: template.kind === "presentation" ? "slides" : "page",
    hint: template.description,
  };
};

/**
 * What a new Cursive project starts with, as tiles: Blank and four
 * templates, and More templates… for the others. A template picked there
 * takes the last tile's place.
 */
export function StartTemplates({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [all, setAll] = useState(false);
  const shown =
    value === BLANK || FEATURED.includes(value)
      ? FEATURED
      : [...FEATURED.slice(0, -1), value];
  const tiles: TemplateTile[] = [
    {
      id: BLANK,
      name: t("Blank"),
      look: "blank",
      hint: t("An empty page to write on"),
    },
    ...shown.map(tileOf),
  ];
  return (
    <>
      <TemplateTiles
        label={t("Start with")}
        tiles={tiles}
        value={value}
        onChange={onChange}
        disabled={disabled}
        more={{
          label: t("More templates…"),
          icon: <LayoutGrid aria-hidden />,
          onClick: () => setAll(true),
        }}
      />
      {all && (
        <TemplateDialog
          onPick={(template) => {
            onChange(template.id);
            setAll(false);
          }}
          onClose={() => setAll(false)}
        />
      )}
    </>
  );
}
