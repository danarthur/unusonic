import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
]);

export default eslintConfig;
