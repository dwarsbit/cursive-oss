import { i18n, react } from "@scholarkit/eslint-config";

export default [
  ...react,
  // Interface text goes through t(). What prints or exports follows the
  // document, not the interface, so the print view stays as written.
  ...i18n.map((config) => ({
    ...config,
    ignores: [...(config.ignores ?? []), "src/export/PrintDoc.tsx"],
  })),
];
