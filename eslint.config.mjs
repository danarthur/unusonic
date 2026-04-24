import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments";
import stageEngineering from "./eslint-plugins/stage-engineering.js";

// ─── Protocol v2 (docs/reference/code/coding-protocol.md) ────────────────────
// This config layers rules in three postures:
//   1. SECURITY BOUNDARIES (error from Day 0) — Supabase client selection,
//      "use client" placement. These catch production security/architecture
//      bugs, not style.
//   2. QUALITY (warn during migration, ratcheted via baseline check) —
//      file-size and complexity limits. See scripts/eslint-baseline.mjs for
//      the ratchet mechanism.
//   3. LEGACY (warn, unscoped) — existing stage-engineering, brand,
//      entity-attribute rules. Untouched by v2.
//
// Baseline snapshot: .eslint-baseline.json
// CI check: npm run lint:baseline (fails if any file exceeds baseline count)

// ─── UI boundary for src/shared/api/supabase/system.ts (service role) ──────
// The service-role client bypasses ALL RLS. Its single actual security risk
// is importing it into code that ships to the browser. We enforce the rule
// as "forbidden in UI layers" rather than an allowlist of server paths —
// server code is trusted by construction; client code never is.
//
// UI-layer globs where system.ts is forbidden:
const SYSTEM_CLIENT_FORBIDDEN_IN = [
  "src/**/ui/**/*.{ts,tsx}",                // feature + widget + shared UI
  "src/entities/**/*.tsx",                  // entity-layer UI (pure components)
  "src/shared/ui/**/*.{ts,tsx}",            // shared primitives
  "src/widgets/**/*.tsx",                   // widgets are UI
  // Client-component subfolders within features that aren't the ui/ convention
  "src/features/**/components/**/*.{ts,tsx}",
  "src/app/**/components/**/*.{ts,tsx}",
];

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
    // Generated types — not subject to size limits.
    "src/types/supabase.ts",
    // Agent-session worktrees (gitignored, but eslint flat config doesn't
    // read .gitignore). Each worktree is a full codebase copy, so without
    // this ignore every violation reports 10-20× depending on how many
    // sessions have run. See docs/reference/code/coding-protocol.md.
    ".claude/**",
  ]),

  // ─── Script files — CommonJS is intentional ───────────────────────────
  // Node CLI scripts in scripts/*.js run directly via `node` without the
  // Next.js bundler; CommonJS `require()` is the simpler, stable pattern
  // here. Turning off @typescript-eslint/no-require-imports for this glob
  // only — it still catches `require()` in src/ where ESM is the rule.
  {
    files: ["scripts/**/*.{js,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // ─── Entity attribute access guardrail ──────────────────────────────────────
  // Ban direct bracket/dot access on variables named `attrs` in server actions
  // and API files — any new read path that bypasses readEntityAttrs() will be
  // caught here at lint time.
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
          selector: "MemberExpression[computed=false][object.name='attrs']",
          message:
            "Use readEntityAttrs() from @/shared/lib/entity-attrs instead of direct attrs access. See attribute-keys.ts for key constants.",
        },
        {
          selector: "MemberExpression[computed=true][object.name='attrs'][property.type='Literal']",
          message:
            "Use readEntityAttrs() from @/shared/lib/entity-attrs instead of direct attrs access. See attribute-keys.ts for key constants.",
        },
      ],
    },
  },

  // ─── Stage Engineering design-system guardrails ─────────────────────────────
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
    plugins: { "stage-engineering": stageEngineering },
    rules: {
      "stage-engineering/no-backdrop-blur-content": "warn",
      "stage-engineering/no-glass-tokens": "warn",
      "stage-engineering/no-neon-blue-accent": "warn",
      "stage-engineering/no-hardcoded-panel-radius": "warn",
      "stage-engineering/no-forbidden-classnames": "warn",
      "stage-engineering/no-legacy-css-vars": "warn",
      "stage-engineering/no-raw-colors": "warn",
    },
  },

  // ─── Legacy brand enforcement ───────────────────────────────────────────────
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: { "stage-engineering": stageEngineering },
    rules: {
      "stage-engineering/no-legacy-brand": "warn",
    },
  },

  // ─── Phase 3 — Untrusted-field interpolation guard (B4) ─────────────────────
  // Any file that interpolates body_text / body_excerpt / note_text /
  // activity_text / ai_classification into a template literal MUST also
  // import wrapUntrusted from the Aion lib. Scoped to server-side code that
  // can plausibly feed the model context — client components don't need it.
  {
    files: [
      "src/app/api/**/*.ts",
      "src/features/**/api/**/*.ts",
      "src/app/**/actions/**/*.ts",
    ],
    plugins: { "stage-engineering": stageEngineering },
    rules: {
      "stage-engineering/require-wrap-untrusted": "error",
    },
  },

  // ─── Phase 3 Sprint 2 — Confirm-gate discipline for Aion §3.5 write tools ──
  // Scope is DELIBERATELY narrow: the three new write tools and their
  // confirmation actions. Pre-existing Aion handlers (action tools, dispatch
  // backend) have their own UX-level confirmation discipline via [Confirm]
  // [Cancel] chips on the tool description and are out of §3.5 scope.
  //
  // When a fourth write tool ships (Phase 4 calendar, mass-send, etc.), add
  // its file to this glob. The rule fails closed: missing import = block.
  //
  // Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.5 C3 rail.
  {
    files: [
      "src/app/api/aion/chat/tools/writes.ts",
      "src/app/(dashboard)/(features)/aion/actions/write-confirmations.ts",
    ],
    plugins: { "stage-engineering": stageEngineering },
    rules: {
      "stage-engineering/require-confirmed-before-dispatch": "error",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Protocol v2 — SECURITY BOUNDARIES (error from Day 0)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Service-role (system.ts) import restriction ────────────────────────────
  // Forbidden in UI layers — these ship to the browser. Server code (route
  // handlers, server actions, features/*/api/**, shared/api/**) is trusted
  // by construction and is allowed to import the service-role client when
  // the operation requires RLS bypass (Aion, webhooks, public-token pages,
  // cron jobs, pre-auth flows).
  {
    files: SYSTEM_CLIENT_FORBIDDEN_IN,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/shared/api/supabase/system",
                "@/shared/api/supabase/system",
              ],
              message:
                "The service-role Supabase client (system.ts) bypasses RLS and must never ship to the browser. UI layers (features/**/ui, widgets, entities, shared/ui, app/**/components) cannot import it. If you need this data on the client, fetch via a Server Action that uses system.ts server-side.",
            },
          ],
        },
      ],
    },
  },

  // ─── "use client" forbidden in Server-Component-only files ─────────────────
  // Route entries (page.tsx, layout.tsx) must be Server-safe. Entities are NOT
  // in this list — in practice they own interactive UI (cards with handlers,
  // selection state) and are client components. Push the client boundary
  // deeper when possible, but don't fight the layer's nature.
  {
    files: [
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program > ExpressionStatement > Literal[value='use client']",
          message:
            "'use client' forbidden here. Route entries must be Server Components. Push the client boundary to a child component.",
        },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Protocol v2 — QUALITY (warn, ratcheted via .eslint-baseline.json)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── File-size limits per layer ─────────────────────────────────────────────
  // Soft limits from docs/reference/code/coding-protocol.md §1. ESLint warns; the
  // baseline ratchet (scripts/eslint-baseline.mjs) prevents any file from
  // exceeding its current violation count.

  // Route entries
  {
    files: [
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
      "src/app/**/loading.tsx",
      "src/app/**/error.tsx",
      "src/app/**/not-found.tsx",
    ],
    rules: {
      "max-lines": ["warn", { max: 150, skipBlankLines: true, skipComments: true }],
    },
  },

  // Route handlers
  {
    files: ["src/app/**/route.ts"],
    rules: {
      "max-lines": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },

  // App-local components (non-route entries)
  {
    files: ["src/app/**/*.tsx"],
    ignores: [
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
      "src/app/**/loading.tsx",
      "src/app/**/error.tsx",
      "src/app/**/not-found.tsx",
    ],
    rules: {
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },

  // Server action files
  {
    files: [
      "src/app/**/actions/**/*.ts",
      "src/app/**/actions/*.ts",
      "src/features/*/api/**/*.ts",
      "src/features/*/api/*.ts",
      "src/entities/*/api/**/*.ts",
      "src/entities/*/api/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },

  // Feature UI
  {
    files: ["src/features/**/ui/**/*.tsx"],
    rules: {
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },

  // Widgets
  {
    files: ["src/widgets/**/*.{ts,tsx}"],
    rules: {
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },

  // Entities
  {
    files: ["src/entities/**/*.{ts,tsx}"],
    rules: {
      "max-lines": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },

  // Shared UI primitives
  {
    files: ["src/shared/ui/**/*.{ts,tsx}"],
    rules: {
      "max-lines": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },

  // Shared lib / api
  {
    files: ["src/shared/lib/**/*.ts", "src/shared/api/**/*.ts"],
    rules: {
      "max-lines": ["warn", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },

  // Test files
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },

  // ─── Function-level limits (all source) ────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/model/schema.ts",          // Zod schemas legitimately run long
      "src/**/model/schemas/*.ts",
    ],
    rules: {
      "max-lines-per-function": [
        "warn",
        { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },

  // Components have a higher function-body limit (JSX is verbose).
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/**/*.test.tsx"],
    rules: {
      "max-lines-per-function": [
        "warn",
        { max: 250, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
    },
  },

  // ─── Complexity metrics ─────────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    plugins: { sonarjs },
    rules: {
      "sonarjs/cognitive-complexity": ["warn", 15],
      "complexity": ["warn", 12],
      "max-depth": ["warn", 4],
      "max-nested-callbacks": ["warn", 3],
      "max-params": ["warn", 4],
      // no-nested-ternary: warn (ratcheted). Target error once baseline clears.
      // 322 pre-existing violations as of 2026-04-13 — too many to fix in one pass.
      "no-nested-ternary": "warn",
    },
  },

  // ─── eslint-disable discipline ──────────────────────────────────────────────
  // Any eslint-disable requires a description.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "@eslint-community/eslint-comments": eslintComments },
    rules: {
      "@eslint-community/eslint-comments/require-description": ["warn", { ignore: [] }],
      "@eslint-community/eslint-comments/no-unused-disable": "warn",
    },
  },
]);

export default eslintConfig;
