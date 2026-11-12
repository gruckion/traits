import { defineConfig } from "vite-plus"

import PackageJson from "./package.json" with { type: "json" }

export default defineConfig({
  root: import.meta.dirname,
  test: {
    alias: { vitest: import.meta.resolve("vite-plus/test") },
    server: { deps: { inline: ["@effect/vitest"] } },
    include: ["test/**/*.test.ts"],
    name: PackageJson.name,
    passWithNoTests: true
  }
})
