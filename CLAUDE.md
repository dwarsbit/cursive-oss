# Notes for agents

- Every piece of user-facing text (interface strings, errors, docs, README, changelog) follows [CONTENT.md](CONTENT.md). It is Polemic's content style; where it says Polemic, read Cursive.
- The interface follows the Polemic UI kit: the tokens in `packages/editor/src/tokens.css` (mauve grays, rust as the one tint), 28px rows, sentence case.
- Every block reads from and writes to Markdown. A new block needs its Markdown form and a round-trip case in `packages/editor/src/editor/markdown.test.ts`.
- The block editor is the workspace package `packages/editor` (`@scholarkit/editor`), shared with Binder. Keep it free of Cursive's app code: it imports nothing from `src/`. See [its README](packages/editor/README.md).
- Every change, feature or bug fix adds its line to the `## X.Y.Z (unreleased)` section at the top of [CHANGELOG.md](CHANGELOG.md), in the same pull request. Changes the reader doesn't see (CI, refactors, tests) get no line.
- Releases are cut from that section by the Cursive release workflow in Scholarkit; see [docs/releasing.md](docs/releasing.md).
- Cursive is developed in the Scholarkit monorepo, in `apps/cursive`, and mirrored to the public `dwarsbit/cursive-oss` repository (GPL-3.0) on every change, with `packages/editor`. Change it in Scholarkit: the next mirror overwrites changes made in the public repository. Keep it buildable on its own there: it may use the workspace's shared packages, nothing from other apps.
- The workflows in `.github/` run in the public repository, not in Scholarkit: desktop CI and the release builds.
- Before you push: `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` for `@scholarkit/cursive` and `@scholarkit/editor`, and `pnpm check:rust` when you changed the desktop app.
