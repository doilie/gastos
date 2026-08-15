import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  // @gastos/shared ships TypeScript source directly (no build step of its
  // own in this monorepo) — bundle it into the server output instead of
  // leaving a bare `import "@gastos/shared"` that plain `node` can't resolve.
  noExternal: [/^@gastos\//],
});
