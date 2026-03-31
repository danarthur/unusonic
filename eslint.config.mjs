import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import stageEngineering from "./eslint-plugins/stage-engineering.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ─── Entity attribute access guardrail ──────────────────────────────────────
  // Ban direct bracket/dot access on variables named `attrs` in server actions
  // and API files — any new read path that bypasses readEntityAttrs() will be
  // caught here at lint time.
  //
  // Scope is intentionally limited to actions/ and api/ directories:
  //   - UI components (.tsx) and non-entity TS files use `attrs` for unrelated
  //     purposes (HTML attributes, form state, etc.) — false positives if broader.
  //   - Entity attribute reads should only ever happen in server actions and API
  //     layers; if a component is reading attrs directly, that is itself a bug.
  //
  // The accessor itself (entity-attrs.ts) is excluded so it can use direct access.
  {
    files: [
      "src/app/**/actions/**/*.ts",
      "src/app/**/actions/*.ts",
      "src/features/*/api/**/*.ts",
      "src/features/*/api/*.ts",
      "src/entities/*/api/**/*.ts",
      "src/entities/*/api/*.ts",
    ],
    ignores: ["src/shared/lib/entity-attrs.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Ban dot notation: attrs.email, attrs.category, etc.
          selector: "MemberExpression[computed=false][object.name='attrs']",
          message:
            "Use readEntityAttrs() from @/shared/lib/entity-attrs instead of direct attrs access. See attribute-keys.ts for key constants.",
        },
        {
          // Ban string-literal bracket notation: attrs['email'], attrs['category'], etc.
          // Does NOT ban constant-keyed access: attrs[PERSON_ATTR.email] is acceptable.
          selector: "MemberExpression[computed=true][object.name='attrs'][property.type='Literal']",
          message:
            "Use readEntityAttrs() from @/shared/lib/entity-attrs instead of direct attrs access. See attribute-keys.ts for key constants.",
        },
      ],
    },
  },
  // ─── Stage Engineering design-system guardrails ─────────────────────────────
  // Enforces the Stage Engineering design system across all UI code. Catches
  // legacy tokens, forbidden class names, raw colors, and legacy CSS vars.
  // All rules are "warn" so they surface during development without blocking
  // builds during migration.
  {
    files: [
      "src/app/**/*.tsx",
      "src/app/**/*.ts",
      "src/widgets/**/*.tsx",
      "src/widgets/**/*.ts",
      "src/features/**/*.tsx",
      "src/features/**/*.ts",
      "src/shared/ui/**/*.tsx",
      "src/shared/ui/**/*.ts",
      "src/entities/**/*.tsx",
      "src/entities/**/*.ts",
    ],
    plugins: {
      "stage-engineering": stageEngineering,
    },
    rules: {
      // Original rules (v1)
      "stage-engineering/no-backdrop-blur-content": "warn",
      "stage-engineering/no-glass-tokens": "warn",
      "stage-engineering/no-neon-blue-accent": "warn",
      "stage-engineering/no-hardcoded-panel-radius": "warn",
      // Design system enforcement (v2)
      "stage-engineering/no-forbidden-classnames": "warn",
      "stage-engineering/no-legacy-css-vars": "warn",
      "stage-engineering/no-raw-colors": "warn",
    },
  },
  // ─── Legacy brand enforcement ───────────────────────────────────────────────
  // Catches legacy brand strings (Signal Live, runsignal.live, signal_ prefixes)
  // across all source code, not just UI files.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      "stage-engineering": stageEngineering,
    },
    rules: {
      "stage-engineering/no-legacy-brand": "warn",
    },
  },
]);

export default eslintConfig;
