import { presets, recommended } from "@effect/tsgo/oxlint-presets"
import { Record } from "effect"
import { defineConfig } from "vite-plus"

import custom from "./oxlints/index.ts"

const toolingIgnores = ["**/.worktrees/**", ".agents/**", "repos/**"]

export default defineConfig({
  fmt: {
    ignorePatterns: toolingIgnores,
    overrides: [
      {
        files: ["**/*.md"],
        options: { printWidth: 80 }
      }
    ],
    proseWrap: "always",
    semi: false,
    sortImports: {},
    sortPackageJson: {},
    sortTailwindcss: { functions: ["cn"] },
    trailingComma: "none"
  },
  lint: {
    extends: [recommended],
    ignorePatterns: toolingIgnores,
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "custom", specifier: "./oxlints/index.ts" }
    ],
    options: { typeAware: true, typeCheck: false },
    rules: {
      ...Record.mapEntries(
        {
          ...presets.correctness.rules,
          ...presets.antipattern.rules,
          ...presets.effectNative.rules,
          ...presets.style.rules
        },
        (_, name) => [name, "error"] as const
      ),
      "effecttsgo/effect-succeed-with-void": "off",
      "effecttsgo/experimental-api-usage": "error",
      "effecttsgo/layer-merge-all-with-dependencies": "off",
      "effecttsgo/lazy-effect": "off",
      "effecttsgo/node-builtin-import": "off",
      "effecttsgo/prefer-schema-over-json": "off",
      "effecttsgo/return-effect-in-gen": "off",
      "effecttsgo/schema-class-missing-brand": "off",
      "effecttsgo/strict-effect-provide": "off",
      "effecttsgo/unstable-api-usage": "off",
      "typescript/no-import-type-side-effects": "error",
      ...Record.mapEntries(custom.rules, (_, name) => [`custom/${name}`, "error"] as const),
      "vite-plus/prefer-vite-plus-imports": "error"
    }
  },
  test: {
    projects: [
      "@traits/typescript/vite.config.ts",
      "oxlints/vite.config.ts",
      "traits-prev/vite.config.ts",
      "traits/vite.config.ts"
    ]
  }
})
