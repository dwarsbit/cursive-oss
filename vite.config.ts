import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { buildVersion } from "@scholarkit/updates/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

// Release builds with SENTRY_AUTH_TOKEN (plus SENTRY_ORG and SENTRY_PROJECT) send their source maps
// to Sentry, so error reports show our code, and leave no map in what ships.
const sentryToken = process.env.SENTRY_AUTH_TOKEN;
const sourceMaps = sentryToken
  ? [
      sentryVitePlugin({
        authToken: sentryToken,
        release: { name: `cursive@${version}`, inject: true },
        sourcemaps: { filesToDeleteAfterUpload: ["./dist*/**/*.map"] },
        telemetry: false,
      }),
    ]
  : [];

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // The web build is served by the Polemic server under /cursive.
  base: mode === "web" ? "/cursive/" : "/",
  build: {
    outDir: mode === "web" ? "dist-web" : "dist",
    sourcemap: sentryToken ? "hidden" : false,
  },
  // The browser build names itself, for "A new version is available".
  plugins: [
    react(),
    tailwindcss(),
    ...sourceMaps,
    ...(mode === "web" ? [buildVersion()] : []),
  ],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  // The desktop app loads the dev server from a fixed port, and its
  // Rust errors stay on screen.
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
    // `pnpm dev:web` runs the web build against a Scholarkit server on
    // this computer (`pnpm dev` in Scholarkit's apps/api).
    proxy:
      mode === "web"
        ? {
            "/api": {
              target: process.env.CURSIVE_SERVER ?? "http://localhost:3000",
              ws: true,
            },
          }
        : undefined,
  },
}));
