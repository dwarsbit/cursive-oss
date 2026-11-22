# @scholarkit/editor

The block editor that Cursive and Binder share, so a note opens the same
in both apps. Every block reads from and writes to Markdown.

It holds the document model (`editor/extensions.ts` and the blocks it
lists), the editor and its menus and node views (`components/`),
references and citations (`references/`), the tutorial blocks
(`tutorial/`), and the page file, properties, links and search helpers
they rest on (`lib/`).

It also holds what both apps need to keep a project in the Scholarkit
account in the browser: the project's synced document
(`lib/project-doc.ts`), its connection to the server (`lib/sync.ts`) and
the account's API (`lib/account.ts`), which each app extends with its own
calls.

## Use it in an app

The package is not published. An app in the Scholarkit workspace adds it
as a workspace dependency:

```json
"@scholarkit/editor": "workspace:*"
```

Import a module by its path under `src`, without the extension:

```ts
import { Editor } from "@scholarkit/editor/components/Editor";
import { readPage, writePage } from "@scholarkit/editor/lib/page-file";
```

The styles come in two files. Import both after Tailwind, then set the
app's tint by overriding `--tint`, `--tint-foreground`, `--tint-soft`
and `--tint-edge` (and `--primary` and `--ring`):

```css
@import "tailwindcss";
@import "@scholarkit/editor/tokens.css";
@import "@scholarkit/editor/editor.css";
```

The package ships its TypeScript sources: the app's bundler compiles
them. In the desktop app, citations from Zotero and BibTeX call the
Tauri commands `zotero_local_fetch`, `zotero_key_get`, `zotero_key_set`,
`zotero_key_delete` and `bibtex_read`, so an app that uses them needs
those commands (Cursive's `src-tauri/src/zotero.rs`).

## Change it

Interface text goes through `t()` from `@scholarkit/i18n`; the apps' catalogs hold it, so
run `pnpm i18n` in Binder and Cursive after a change. What the editor writes into a
document, such as citations, numbered captions and month names, stays out of `t()`: it
follows the document, not the interface.

A new block needs its Markdown form and a round-trip case in
`src/editor/markdown.test.ts`. Run `pnpm test --filter @scholarkit/editor`
from the repository root for the package's own tests, or `pnpm test` for
every package's.

Cursive's public repository carries a copy of this package, so keep it
free of Scholarkit's private code: it may use the workspace's shared
packages, nothing from an app.
