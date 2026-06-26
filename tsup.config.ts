import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  // Shebang so the published bin is directly executable via `npx matchday-mcp`.
  banner: { js: "#!/usr/bin/env node" },
});
