import vue from "eslint-plugin-vue";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";

export default [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2021,
      sourceType: "module",
    },
    plugins: {
      vue,
      "@typescript-eslint": tseslint,
    },
    rules: {
      // The base rule doesn't understand TS-only constructs (type-literal function
      // signatures, ambient declarations) and flags their parameter names as
      // "unused" even though they're purely documentational. Use the TS-aware
      // version instead, as recommended by typescript-eslint's own docs.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "none",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Was fully "off"; downgraded to "warn" so misuse of `any` in new code is
      // visible without forcing an invasive rewrite of existing pragmatic `any`
      // usage (event payloads, sharedData bags, etc.).
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      ecmaVersion: 2021,
      sourceType: "module",
      parserOptions: {
        parser: tsParser,
      },
    },
    plugins: {
      vue,
    },
    rules: {
      "no-unused-vars": "warn",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "demo/**", "src/vue-demo/**", "coverage/**"],
  },
];
