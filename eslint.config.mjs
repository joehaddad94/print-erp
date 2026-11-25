import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** Tailwind discipline: arbitrary values (`w-[37px]`, `bg-[#f00]`) bypass the design tokens. */
const ARBITRARY = String.raw`/(^|\s|:)-?[a-z][\w-]*-\[[^\]]+\]/`;
const ARBITRARY_MSG =
  "Arbitrary Tailwind value. Use a design token (src/styles/tokens.css + @theme in globals.css) instead.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${ARBITRARY}]`, message: ARBITRARY_MSG },
        { selector: `TemplateElement[value.raw=${ARBITRARY}]`, message: ARBITRARY_MSG },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              importNames: ["default"],
              message: "Use { Link } from @/components/ui/link: it adds the loading bar.",
            },
          ],
        },
      ],
    },
  },
  { files: ["src/components/ui/link.tsx"], rules: { "no-restricted-imports": "off" } },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "tests/lint-fixtures/**",
  ]),
]);

export default eslintConfig;
