import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isReplit = process.env.REPL_ID !== undefined;

export default defineConfig({
  plugins: [
    react(),
    ...(isReplit && process.env.NODE_ENV !== "production"
      ? [
          (await import("@replit/vite-plugin-runtime-error-modal")).default(),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // NOTE on manualChunks:
    //   A previous version of this file split node_modules into hand-picked
    //   chunks (vendor-react, vendor-firebase, vendor-charts, vendor-radix, ...).
    //   That produced a circular import — Rollup hoisted a shared CJS-interop
    //   helper (`function oe(e){...}`) into vendor-charts, and then
    //   vendor-react re-imported it from vendor-charts. The entry chunk
    //   eagerly imported vendor-charts, which on evaluation hit React in TDZ:
    //     ReferenceError: Cannot access 'P' before initialization
    //   The whole app rendered blank because the entry's `boot()` was never
    //   reached — module evaluation threw before any React render ran, and
    //   the thrown error happened OUTSIDE main.tsx's try/catch (it was the
    //   sync top-level evaluation of vendor-charts, not the dynamic import
    //   of App).
    //
    //   Until we have a chunking strategy that's proven cycle-free, let
    //   Rollup's default automatic chunking handle vendor splitting. It
    //   already code-splits per lazy route via the `lazy(() => import(...))`
    //   calls in App.tsx, so initial bundle size stays reasonable.
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
