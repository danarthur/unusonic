/**
 * ESLint plugin: stage-engineering
 *
 * Enforces the Unusonic Stage Engineering design system. Catches legacy tokens,
 * forbidden class names, raw colors, and legacy brand strings. All rules are
 * "warn" severity by default so they surface during development without
 * blocking builds.
 *
 * Designed for ESLint v9 flat config.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return the raw string value from an AST node, handling:
 *  - Literal ("foo")
 *  - TemplateLiteral (`foo ${bar} baz` — checks quasis only)
 */
function getStringFragments(node) {
  if (node.type === "Literal" && typeof node.value === "string") {
    return [{ value: node.value, node }];
  }
  if (node.type === "TemplateLiteral") {
    return node.quasis.map((q) => ({ value: q.value.raw, node: q }));
  }
  return [];
}

/**
 * True when the node sits inside a JSX attribute (className, style, etc.).
 */
function isInsideJSXAttribute(node) {
  let current = node.parent;
  while (current) {
    if (current.type === "JSXAttribute") return true;
    if (current.type === "JSXExpressionContainer") {
      current = current.parent;
      continue;
    }
    current = current.parent;
  }
  return false;
}

/**
 * True when the node sits inside a JSX className attribute specifically.
 */
function isInsideClassNameAttr(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === "JSXAttribute" &&
      current.name &&
      current.name.name === "className"
    ) {
      return true;
    }
    if (current.type === "JSXExpressionContainer") {
      current = current.parent;
      continue;
    }
    // Also catch cn() / clsx() calls where className is the common use
    current = current.parent;
  }
  return false;
}

/**
 * True when the node is inside a cn(), clsx(), or cva() call — the typical
 * class-name composition utilities. These calls may or may not be directly
 * inside a JSX className attribute (e.g. stored in a const).
 */
function isInsideCnCall(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === "CallExpression" &&
      current.callee &&
      current.callee.type === "Identifier" &&
      /^(cn|clsx|cva)$/.test(current.callee.name)
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * True when the node is inside a JSX style attribute or a style object value.
 */
function isInsideStyleAttr(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === "JSXAttribute" &&
      current.name &&
      current.name.name === "style"
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * True when the node is in a class-name-relevant context:
 * JSX className, cn()/clsx()/cva() call, or a const assigned to a class string.
 */
function isClassNameContext(node) {
  return isInsideClassNameAttr(node) || isInsideCnCall(node);
}

/**
 * True when the node is in any styling context (className, cn(), or style).
 */
function isStylingContext(node) {
  return isClassNameContext(node) || isInsideStyleAttr(node) || isInsideJSXAttribute(node);
}

// ── File-path predicates ─────────────────────────────────────────────────────

const CONTENT_PANEL_DIRS = [
  "src/app/(dashboard)/",
  "src/widgets/",
  "src/features/",
];

const OVERLAY_FILENAME_KEYWORDS = [
  "modal",
  "dialog",
  "popover",
  "overlay",
  "picker",
];

function isContentPanelFile(filename) {
  return CONTENT_PANEL_DIRS.some((dir) => filename.includes(dir));
}

function isOverlayFile(filename) {
  const base = filename.split("/").pop().toLowerCase();
  return OVERLAY_FILENAME_KEYWORDS.some((kw) => base.includes(kw));
}

// ── Rule: no-backdrop-blur-content ───────────────────────────────────────────

const noBackdropBlurContent = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow backdrop-blur on content panels (Stage Engineering migration)",
    },
    messages: {
      found:
        "Stage Engineering: Use opaque surfaces (--stage-surface) instead of backdrop-blur on content panels.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    // Only applies to dashboard/widgets/features, and NOT overlay files
    if (!isContentPanelFile(filename) || isOverlayFile(filename)) {
      return {};
    }

    const PATTERNS = [/backdrop-blur/, /backdrop-filter/];

    function check(node) {
      const fragments = getStringFragments(node);
      for (const { value, node: fragNode } of fragments) {
        for (const pat of PATTERNS) {
          if (pat.test(value)) {
            context.report({ node: fragNode, messageId: "found" });
            break; // one report per fragment
          }
        }
      }
    }

    return {
      Literal: check,
      TemplateLiteral: check,
    };
  },
};

// ── Rule: no-glass-tokens ────────────────────────────────────────────────────

const GLASS_TOKENS = [
  "--glass-border",
  "--glass-bg",
  "--glass-shadow",
  "--color-glass-surface",
  "--color-glass-highlight",
];

const noGlassTokens = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow legacy glass design tokens (Stage Engineering migration)",
    },
    messages: {
      found: "Stage Engineering: Use --stage-* tokens instead of legacy glass tokens.",
    },
    schema: [],
  },
  create(context) {
    function check(node) {
      if (!isInsideJSXAttribute(node)) return;
      const fragments = getStringFragments(node);
      for (const { value, node: fragNode } of fragments) {
        for (const token of GLASS_TOKENS) {
          if (value.includes(token)) {
            context.report({ node: fragNode, messageId: "found" });
            break;
          }
        }
      }
    }

    return {
      Literal: check,
      TemplateLiteral: check,
    };
  },
};

// ── Rule: no-neon-blue-accent ────────────────────────────────────────────────

const noNeonBlueAccent = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow neon-blue accent tokens (Stage Engineering migration)",
    },
    messages: {
      found: "Stage Engineering: Use --stage-accent instead of neon-blue.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    // Skip globals.css where the token is defined
    if (filename.endsWith("globals.css")) return {};

    const PATTERNS = [/neon-blue/, /--color-neon-blue/];

    function check(node) {
      if (!isInsideJSXAttribute(node)) return;
      const fragments = getStringFragments(node);
      for (const { value, node: fragNode } of fragments) {
        for (const pat of PATTERNS) {
          if (pat.test(value)) {
            context.report({ node: fragNode, messageId: "found" });
            break;
          }
        }
      }
    }

    return {
      Literal: check,
      TemplateLiteral: check,
    };
  },
};

// ── Rule: no-hardcoded-panel-radius ──────────────────────────────────────────

const noHardcodedPanelRadius = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow hardcoded large border-radius values (Stage Engineering migration)",
    },
    messages: {
      found:
        "Stage Engineering: Use rounded-[var(--stage-radius-panel,12px)] for density-aware radius.",
    },
    schema: [],
  },
  create(context) {
    const PATTERNS = [/\brounded-3xl\b/, /\brounded-\[28px\]/, /\brounded-\[24px\]/];

    function check(node) {
      if (!isInsideClassNameAttr(node)) return;
      const fragments = getStringFragments(node);
      for (const { value, node: fragNode } of fragments) {
        for (const pat of PATTERNS) {
          if (pat.test(value)) {
            context.report({ node: fragNode, messageId: "found" });
            break;
          }
        }
      }
    }

    return {
      Literal: check,
      TemplateLiteral: check,
    };
  },
};

// ── Rule: no-forbidden-classnames ────────────────────────────────────────────

/**
 * Map of forbidden Tailwind/CSS class patterns → replacement suggestions.
 * Each entry: [regex, replacement (string|null), message].
 * If replacement is null, auto-fix is not available.
 */
const FORBIDDEN_CLASSNAMES = [
  // ── Shadcn semantic tokens ──
  [/\bbg-card\b/, "bg-[var(--stage-surface)]", "Use --stage-surface instead of bg-card"],
  [/\bbg-background\b/, "bg-[var(--stage-surface)]", "Use --stage-surface instead of bg-background"],
  [/\bbg-popover\b/, "bg-[var(--stage-surface-raised)]", "Use --stage-surface-raised instead of bg-popover"],
  [/\bbg-muted\b/, "bg-[var(--stage-surface-nested)]", "Use --stage-surface-nested instead of bg-muted"],
  [/\bbg-accent\b(?!\/)/, "bg-[var(--stage-accent-muted)]", "Use --stage-accent-muted instead of bg-accent"],
  [/\bbg-primary\b/, "bg-[var(--stage-accent)]", "Use --stage-accent instead of bg-primary"],
  [/\bbg-secondary\b/, "bg-[oklch(1_0_0_/_0.06)]", "Use OKLCH value instead of bg-secondary"],
  [/\bbg-destructive\b/, "bg-[var(--color-unusonic-error)]", "Use --color-unusonic-error instead of bg-destructive"],

  // ── Absolute colors ──
  [/\bbg-white\b/, "bg-[oklch(1_0_0)]", "Use OKLCH instead of bg-white"],
  [/\bbg-black\b(?!\/)/, "bg-[var(--stage-void)]", "Use --stage-void instead of bg-black"],
  [/\btext-white\b/, "text-[oklch(1_0_0)]", "Use OKLCH instead of text-white"],
  [/\btext-black\b/, "text-[oklch(0_0_0)]", "Use OKLCH instead of text-black"],

  // ── Shadcn foreground tokens ──
  [/\btext-primary-foreground\b/, "text-[var(--stage-text-primary)]", "Use --stage-text-primary"],
  [/\btext-muted-foreground\b/, "text-[var(--stage-text-secondary)]", "Use --stage-text-secondary"],
  [/\btext-card-foreground\b/, "text-[var(--stage-text-primary)]", "Use --stage-text-primary"],
  [/\btext-popover-foreground\b/, "text-[var(--stage-text-primary)]", "Use --stage-text-primary"],
  [/\btext-accent-foreground\b/, "text-[var(--stage-text-primary)]", "Use --stage-text-primary"],
  [/\btext-destructive-foreground\b/, "text-[oklch(1_0_0)]", "Use OKLCH white instead of text-destructive-foreground"],
  [/\btext-destructive\b/, "text-[var(--color-unusonic-error)]", "Use --color-unusonic-error"],
  [/\btext-muted\b(?!-)/, "text-[var(--stage-text-secondary)]", "Use --stage-text-secondary instead of text-muted"],
  [/\btext-cream\b/, "text-[var(--stage-text-primary)]", "Use --stage-text-primary instead of text-cream"],
  [/\btext-primary\b(?!-)/, "text-[var(--stage-text-primary)]", "Use --stage-text-primary instead of text-primary"],

  // ── Shadcn border tokens ──
  [/\bborder-input\b/, "border-[var(--stage-edge-subtle)]", "Use --stage-edge-subtle instead of border-input"],
  [/\bborder-border\b/, "border-[var(--stage-edge-subtle)]", "Use --stage-edge-subtle instead of border-border"],
  [/\bborder-destructive\b/, "border-[var(--color-unusonic-error)]", "Use --color-unusonic-error"],
  [/\bring-destructive\b/, "ring-[var(--color-unusonic-error)]", "Use --color-unusonic-error"],

  // ── Raw Tailwind color scales (bg, text, border) ──
  [/\b(bg|text|border)-(gray|slate|zinc|neutral|stone)-\d+\b/, null, "Use --stage-surface-<tier> or OKLCH tokens instead of raw gray scales"],
  [/\b(bg|text|border)-(red|rose)-\d+\b/, null, "Use --color-unusonic-error or OKLCH instead of raw red/rose"],
  [/\b(bg|text|border)-(green|emerald|teal)-\d+\b/, null, "Use --color-unusonic-success or OKLCH instead of raw green"],
  [/\b(bg|text|border)-(yellow|amber|orange)-\d+\b/, null, "Use --color-unusonic-warning or OKLCH instead of raw yellow/amber/orange"],
  [/\b(bg|text|border)-(blue|sky|cyan|indigo)-\d+\b/, null, "Use OKLCH tokens instead of raw blue scales"],
  [/\b(bg|text|border)-(purple|violet|fuchsia|pink)-\d+\b/, null, "Use OKLCH tokens instead of raw purple/pink scales"],
  [/\b(bg|text|border)-lime-\d+\b/, null, "Use OKLCH tokens instead of raw lime"],

  // ── Legacy miscellaneous ──
  [/\bring-offset-obsidian\b/, "ring-offset-[var(--stage-void)]", "Use --stage-void instead of ring-offset-obsidian"],
  [/\bbackdrop-blur(?:-\w+)?\b/, null, "Stage Engineering uses opaque surfaces, not backdrop-blur"],
  [/\banimate-pulse\b/, null, "Use stage-skeleton class or Framer Motion instead of animate-pulse"],

  // ── dark: prefix ──
  [/\bdark:[\w\-[\]()/.]+/, null, "Remove dark: prefix — Stage Engineering is dark-only"],
];

const noForbiddenClassnames = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description: "Disallow forbidden class names that violate Stage Engineering design system",
    },
    messages: {
      forbidden: "Stage Engineering: {{ message }}. Found: `{{ found }}`",
    },
    schema: [],
  },
  create(context) {
    function check(node) {
      // Only check className contexts — NOT style attributes or arbitrary strings
      if (!isClassNameContext(node)) return;
      const fragments = getStringFragments(node);
      for (const { value, node: fragNode } of fragments) {
        // Split into tokens and check each
        const tokens = value.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          // Skip tokens with arbitrary value brackets — the content inside
          // [...] is CSS, not a class name. e.g. text-[var(--stage-text-primary)]
          // contains "text-primary" but that's not a forbidden class.
          if (token.includes("[")) continue;
          for (const [pattern, replacement, message] of FORBIDDEN_CLASSNAMES) {
            const match = token.match(pattern);
            if (match) {
              const reportObj = {
                node: fragNode,
                messageId: "forbidden",
                data: { message, found: match[0] },
              };
              if (replacement) {
                reportObj.fix = function (fixer) {
                  const src = context.sourceCode.getText(fragNode);
                  const newSrc = src.replace(match[0], replacement);
                  return fixer.replaceText(fragNode, newSrc);
                };
              }
              context.report(reportObj);
              break; // one report per token
            }
          }
        }
      }
    }

    return {
      Literal: check,
      TemplateLiteral: check,
    };
  },
};

// ── Rule: no-legacy-css-vars ────────────────────────────────────────────────

/**
 * Map of legacy CSS custom properties to their Stage Engineering replacements.
 * [searchString, replacement (string|null), message]
 */
const LEGACY_CSS_VARS = [
  ["var(--ring)", "var(--stage-accent)", "Use --stage-accent instead of --ring"],
  ["var(--popover)", "var(--stage-surface-raised)", "Use --stage-surface-raised instead of --popover"],
  ["var(--popover-foreground)", "var(--stage-text-primary)", "Use --stage-text-primary instead of --popover-foreground"],
  ["var(--border)", null, "Use var(--stage-edge-subtle) or oklch(1 0 0 / 0.08) instead of --border"],
  ["var(--background)", null, "Use var(--stage-surface) or var(--stage-void) instead of --background"],
  ["var(--foreground)", "var(--stage-text-primary)", "Use --stage-text-primary instead of --foreground"],
  ["var(--muted-foreground)", "var(--stage-text-secondary)", "Use --stage-text-secondary instead of --muted-foreground"],
  ["var(--muted)", "var(--stage-surface-nested)", "Use --stage-surface-nested instead of --muted"],
  ["var(--destructive)", "var(--color-unusonic-error)", "Use --color-unusonic-error instead of --destructive"],
  ["var(--color-mercury)", null, "Use OKLCH equivalent instead of --color-mercury"],
  ["var(--color-glass-surface)", "var(--stage-surface)", "Use --stage-surface instead of --color-glass-surface"],
  ["var(--color-obsidian)", "var(--stage-void)", "Use --stage-void instead of --color-obsidian"],
];

// Pre-filter: skip vars that are substrings of valid stage vars.
// e.g. "var(--accent)" should NOT match inside "var(--stage-accent)".
// We use exact string search, not regex, so this is naturally safe — but
// we must be careful with "var(--muted)" not matching "var(--muted-foreground)".
// The LEGACY_CSS_VARS list is ordered so longer strings come first for --muted-foreground.

const noLegacyCssVars = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description: "Disallow legacy CSS custom properties (Stage Engineering migration)",
    },
    messages: {
      found: "Stage Engineering: {{ message }}. Found: `{{ found }}`",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    // Skip globals.css where tokens are defined
    if (filename.endsWith("globals.css")) return {};

    function check(node) {
      if (!isStylingContext(node)) return;
      const fragments = getStringFragments(node);
      for (const { value, node: fragNode } of fragments) {
        for (const [search, replacement, message] of LEGACY_CSS_VARS) {
          const idx = value.indexOf(search);
          if (idx === -1) continue;
          // Avoid false positive: make sure this isn't part of a longer --stage-* var.
          // Check that the char before "var(--" is not a letter/dash that would make it
          // part of a longer token like "--stage-accent" matching "--accent".
          // Since we search for the full "var(--name)" form, this is already safe.

          const reportObj = {
            node: fragNode,
            messageId: "found",
            data: { message, found: search },
          };
          if (replacement) {
            reportObj.fix = function (fixer) {
              const src = context.sourceCode.getText(fragNode);
              const newSrc = src.replace(search, replacement);
              return fixer.replaceText(fragNode, newSrc);
            };
          }
          context.report(reportObj);
        }
      }
    }

    return {
      Literal: check,
      TemplateLiteral: check,
    };
  },
};

// ── Rule: no-raw-colors ─────────────────────────────────────────────────────

const HEX_PATTERN = /#([0-9a-fA-F]{3}){1,2}\b/;
const RGB_PATTERN = /\brgba?\s*\(/;

const noRawColors = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow raw hex and rgb/rgba colors — use OKLCH or --stage-* tokens",
    },
    messages: {
      hex: "Stage Engineering: Use OKLCH color values instead of hex colors. Found: `{{ found }}`",
      rgb: "Stage Engineering: Use OKLCH color values instead of rgb/rgba. Found: `{{ found }}`",
    },
    schema: [],
  },
  create(context) {
    function check(node) {
      if (!isStylingContext(node)) return;
      const fragments = getStringFragments(node);
      for (const { value, node: fragNode } of fragments) {
        const hexMatch = value.match(HEX_PATTERN);
        if (hexMatch) {
          context.report({
            node: fragNode,
            messageId: "hex",
            data: { found: hexMatch[0] },
          });
        }
        const rgbMatch = value.match(RGB_PATTERN);
        if (rgbMatch) {
          context.report({
            node: fragNode,
            messageId: "rgb",
            data: { found: rgbMatch[0].trim() },
          });
        }
      }
    }

    return {
      Literal: check,
      TemplateLiteral: check,
    };
  },
};

// ── Rule: no-legacy-brand ───────────────────────────────────────────────────

const BRAND_PATTERNS = [
  [/Signal\s+Live/i, "Unusonic", "Use 'Unusonic' instead of 'Signal Live'"],
  [/runsignal\.live/, "unusonic.com", "Use 'unusonic.com' instead of 'runsignal.live'"],
  [/signal_trusted_device/, "unusonic_trusted_device", "Use unusonic_ prefix"],
  [/signal_current_org_id/, "unusonic_current_org_id", "Use unusonic_ prefix"],
  [/signal_recovery_prompt_dismissed_until/, "unusonic_recovery_prompt_dismissed_until", "Use unusonic_ prefix"],
  [/SIGNAL_PHYSICS/, "UNUSONIC_PHYSICS", "Use UNUSONIC_ prefix"],
  [/danielos_/, "unusonic_", "Use unusonic_ prefix instead of danielos_"],
  [/\bbg-signal-void\b/, "bg-unusonic-void", "Use unusonic- prefix instead of signal-"],
];

const noLegacyBrand = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description: "Disallow legacy brand strings (Signal Live, runsignal.live, signal_ prefixes)",
    },
    messages: {
      found: "Legacy brand: {{ message }}. Found: `{{ found }}`",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    // Skip migration files — they are historical records
    if (filename.includes("/migrations/") || filename.endsWith(".sql")) return {};
    // Skip this plugin file itself
    if (filename.includes("eslint-plugins/")) return {};

    function check(node) {
      // Skip import paths
      if (node.parent && node.parent.type === "ImportDeclaration" && node.parent.source === node) {
        return;
      }
      const fragments = getStringFragments(node);
      for (const { value, node: fragNode } of fragments) {
        for (const [pattern, replacement, message] of BRAND_PATTERNS) {
          const match = value.match(pattern);
          if (match) {
            const reportObj = {
              node: fragNode,
              messageId: "found",
              data: { message, found: match[0] },
            };
            if (replacement) {
              reportObj.fix = function (fixer) {
                const src = context.sourceCode.getText(fragNode);
                const newSrc = src.replace(match[0], replacement);
                return fixer.replaceText(fragNode, newSrc);
              };
            }
            context.report(reportObj);
          }
        }
      }
    }

    return {
      Literal: check,
      TemplateLiteral: check,
    };
  },
};

// ── require-wrap-untrusted ───────────────────────────────────────────────────
//
// Phase 3 Sprint 1 Week 2 — B4 injection safety enforcement. Any file that
// reads client-authored content (email bodies, note text, message excerpts)
// and threads it into a template literal MUST also import `wrapUntrusted`
// from `@/app/api/aion/lib/wrap-untrusted` — making the injection-safety
// discipline explicit at the file level.
//
// Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.2 B4.
//
// Forbidden identifier names in template literal expressions:
//   body_text, body_excerpt, note_text, activity_text, ai_classification
// (ai_summary is owner-generated from Haiku and considered safe.)
//
// This is a heuristic rule — a false positive gets silenced with a standard
// eslint-disable comment. The goal is to fail loudly when a new file starts
// concatenating untrusted text without reaching for the wrapper.

const UNTRUSTED_FIELD_NAMES = new Set([
  "body_text",
  "body_excerpt",
  "note_text",
  "activity_text",
  "ai_classification",
]);

/**
 * Recursively check if an expression references any of the forbidden field
 * names via Identifier or MemberExpression property.
 */
function referencesUntrustedField(expr) {
  if (!expr) return false;
  if (expr.type === "Identifier") {
    return UNTRUSTED_FIELD_NAMES.has(expr.name);
  }
  if (expr.type === "MemberExpression") {
    if (expr.property?.type === "Identifier" && UNTRUSTED_FIELD_NAMES.has(expr.property.name)) {
      return true;
    }
    return referencesUntrustedField(expr.object);
  }
  if (expr.type === "LogicalExpression" || expr.type === "BinaryExpression") {
    return referencesUntrustedField(expr.left) || referencesUntrustedField(expr.right);
  }
  if (expr.type === "ConditionalExpression") {
    return (
      referencesUntrustedField(expr.test) ||
      referencesUntrustedField(expr.consequent) ||
      referencesUntrustedField(expr.alternate)
    );
  }
  if (expr.type === "CallExpression") {
    return expr.arguments.some(referencesUntrustedField);
  }
  return false;
}

const requireWrapUntrusted = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require import of wrapUntrusted when interpolating untrusted client fields in template literals.",
    },
    schema: [],
    messages: {
      missingImport:
        "Template literal interpolates client-authored field ({{field}}) — this file must `import { wrapUntrusted } from '@/app/api/aion/lib/wrap-untrusted'` and apply it before the value enters the model context. Silence with eslint-disable when the value is only going to storage or the DB.",
    },
  },
  create(context) {
    let hasWrapUntrustedImport = false;
    const pending = [];

    return {
      ImportDeclaration(node) {
        const src = node.source?.value;
        if (typeof src === "string" && src.includes("wrap-untrusted")) {
          hasWrapUntrustedImport = true;
        }
      },
      TemplateLiteral(node) {
        for (const expr of node.expressions) {
          if (referencesUntrustedField(expr)) {
            let fieldName = "untrusted field";
            // Best-effort name extraction for the error message.
            if (expr.type === "Identifier") fieldName = expr.name;
            else if (expr.type === "MemberExpression" && expr.property?.type === "Identifier") {
              fieldName = expr.property.name;
            }
            pending.push({ node: expr, field: fieldName });
          }
        }
      },
      "Program:exit"() {
        if (hasWrapUntrustedImport) return;
        for (const { node, field } of pending) {
          context.report({ node, messageId: "missingImport", data: { field } });
        }
      },
    };
  },
};


// ── require-confirmed-before-dispatch ────────────────────────────────────────
//
// Phase 3 Sprint 2 §3.5 C3 rail. Any Aion write handler that dispatches to
// Resend (outbound email), Twilio (outbound SMS), or the Replies sendReply
// server action MUST go through the requireConfirmed() gate — the aion_write_log
// audit row's `confirmed_at` must be stamped and the row re-read before the
// irreversible side-effect happens. Blocks replay, user-mismatch, and
// unconfirmed-dispatch bugs.
//
// This is a file-level heuristic: if a dispatch call is present in the file
// AND the file does not import requireConfirmed, fail. A false positive (e.g.
// a well-audited handler that calls a wrapper which itself calls
// requireConfirmed) can be silenced with a standard eslint-disable.
//
// Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.5 C3 rail.

const DISPATCH_CALL_PATTERNS = [
  // resend.emails.send(...)
  { object: "emails", method: "send" },
  // twilio.messages.create(...)
  { object: "messages", method: "create" },
];

const DISPATCH_IMPORT_NAMES = new Set([
  // Replies-feature sendReply — the canonical outbound-email path.
  "sendReply",
]);

const requireConfirmedBeforeDispatch = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Aion write dispatchers must import requireConfirmed before calling Resend / Twilio / sendReply.",
    },
    schema: [],
    messages: {
      missingGate:
        "This file dispatches to an outbound channel ({{call}}) but does not import `requireConfirmed` from '@/app/api/aion/lib/require-confirmed'. Every Aion write handler must call requireConfirmed(draftId, userId) before the side-effect — see docs/reference/aion-deal-chat-phase3-plan.md §3.5 C3. Silence with eslint-disable when this file is called from another file that has already gated.",
    },
  },
  create(context) {
    let hasRequireConfirmedImport = false;
    let hasDispatchImport = false;
    const dispatchCalls = [];

    const isDispatchMember = (callee) => {
      if (callee?.type !== "MemberExpression") return null;
      const propName = callee.property?.name;
      // Drill to the nearest Identifier on the object side.
      let obj = callee.object;
      while (obj?.type === "MemberExpression") obj = obj.object;
      const objName = obj?.type === "Identifier" ? obj.name : null;
      for (const p of DISPATCH_CALL_PATTERNS) {
        if (propName === p.method && objName === p.object) return `${p.object}.${p.method}`;
        // Chained forms: resend.emails.send — check inner.property.name too.
        if (callee.object?.type === "MemberExpression") {
          const innerProp = callee.object.property?.name;
          if (propName === p.method && innerProp === p.object) return `${innerProp}.${p.method}`;
        }
      }
      return null;
    };

    return {
      ImportDeclaration(node) {
        const src = node.source?.value;
        if (typeof src === "string" && src.includes("require-confirmed")) {
          hasRequireConfirmedImport = true;
        }
        if (typeof src === "string") {
          for (const spec of node.specifiers) {
            if (spec.type === "ImportSpecifier" && DISPATCH_IMPORT_NAMES.has(spec.imported?.name)) {
              hasDispatchImport = true;
            }
          }
        }
      },
      CallExpression(node) {
        const member = isDispatchMember(node.callee);
        if (member) {
          dispatchCalls.push({ node, call: member });
          return;
        }
        // sendReply(...)
        if (node.callee?.type === "Identifier" && DISPATCH_IMPORT_NAMES.has(node.callee.name)) {
          dispatchCalls.push({ node, call: node.callee.name });
        }
      },
      "Program:exit"() {
        if (dispatchCalls.length === 0) return;
        if (hasRequireConfirmedImport) return;
        // sendReply may be imported without any dispatch call — only report if
        // the file imports AND calls it (which dispatchCalls already reflects).
        void hasDispatchImport;
        for (const { node, call } of dispatchCalls) {
          context.report({ node, messageId: "missingGate", data: { call } });
        }
      },
    };
  },
};


// ── no-mutation-without-authz ────────────────────────────────────────────────
//
// Catches the sev-zero shape from the 2026-04-10 PUBLIC-grants incident: a
// `'use server'` action that uses `getSystemClient()` (service-role, bypasses
// RLS) to mutate a workspace-scoped row without first reaching an authz helper.
// RLS is the backstop for cookie-session clients; service-role code paths have
// no backstop, so the gate must be explicit in app code.
//
// Triggers when ALL of:
//   1. File contains `'use server'` directive.
//   2. File imports `getSystemClient` from `@/shared/api/supabase/system`.
//   3. File contains a mutation call: `.insert(`, `.update(`, `.delete(`, `.upsert(`.
//
// Passes when the file ALSO imports any of:
//   - `requireRole`, `requirePermission`, `hasCapability` from permissions
//   - `requireTierCapability` from tier-gate
//   - `requireBillingActive` from billing-gate
//   - `requireFeatureEnabled` from feature-flags
//   - `requireStepUp` from client-portal/step-up
//   - `requireWorkspaceMember` (any source — convention)
//   - Has an `// AUTHZ-OK:` line comment with a reason
//
// False positive: a file that gates via a wrapper imported from a sibling
// module. Silence with `eslint-disable-next-line ... no-mutation-without-authz`
// at the import or with `// AUTHZ-OK: gates via xWrapper` near the top.

const AUTHZ_HELPER_NAMES = new Set([
  // Workspace-scoped permission helpers
  "requireRole",
  "requirePermission",
  "hasCapability",
  "requireTierCapability",
  "requireBillingActive",
  "requireFeatureEnabled",
  "requireWorkspaceMember",
  "memberHasPermission",
  "userHasWorkspaceRole",
  // Client-portal / step-up gates
  "requireStepUp",
  // Aion write-tool confirmation gates
  "requireConfirmed",
  "markExecuted",
]);

const SYSTEM_CLIENT_IMPORT = "@/shared/api/supabase/system";
const MUTATION_METHOD_NAMES = new Set(["insert", "update", "delete", "upsert"]);

const noMutationWithoutAuthz = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Server actions using the service-role client to mutate must call an authz helper first.",
    },
    schema: [],
    messages: {
      missingAuthz:
        "Server action uses getSystemClient() to call .{{method}}(...) but doesn't import an authz helper. Service-role bypasses RLS — the workspace-membership check must be explicit in app code. Import one of: requireRole, requirePermission, hasCapability, requireWorkspaceMember. Or add `// AUTHZ-OK: <reason>` comment if the gate is in a wrapper.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    let isUseServerFile = false;
    let importsSystemClient = false;
    let importsAuthzHelper = false;
    let hasAuthzOkComment = false;
    const mutationCalls = [];

    return {
      Program(node) {
        // Check for 'use server' directive at top of file
        for (const directive of node.body) {
          if (
            directive.type === "ExpressionStatement" &&
            directive.expression?.type === "Literal" &&
            directive.expression.value === "use server"
          ) {
            isUseServerFile = true;
            break;
          }
          // Stop at first non-directive
          if (directive.type !== "ExpressionStatement") break;
        }

        // Check for AUTHZ-OK comment anywhere in the file
        const comments = sourceCode.getAllComments();
        for (const c of comments) {
          if (/AUTHZ-OK:/i.test(c.value)) {
            hasAuthzOkComment = true;
            break;
          }
        }
      },
      ImportDeclaration(node) {
        const src = node.source?.value;
        if (typeof src !== "string") return;

        if (src === SYSTEM_CLIENT_IMPORT) {
          importsSystemClient = true;
        }
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier" && AUTHZ_HELPER_NAMES.has(spec.imported?.name)) {
            importsAuthzHelper = true;
          }
        }
      },
      CallExpression(node) {
        // Match `<expr>.<method>(...)` where method is a mutation
        const callee = node.callee;
        if (
          callee?.type === "MemberExpression" &&
          callee.property?.type === "Identifier" &&
          MUTATION_METHOD_NAMES.has(callee.property.name)
        ) {
          mutationCalls.push({ node, method: callee.property.name });
        }
      },
      "Program:exit"() {
        if (!isUseServerFile) return;
        if (!importsSystemClient) return;
        if (mutationCalls.length === 0) return;
        if (importsAuthzHelper || hasAuthzOkComment) return;
        // Report on the first mutation only — once per file is enough
        const first = mutationCalls[0];
        context.report({
          node: first.node,
          messageId: "missingAuthz",
          data: { method: first.method },
        });
      },
    };
  },
};

// ── webhook-verify-before-parse ──────────────────────────────────────────────
//
// Webhook routes must read the raw request body via `req.text()` (or equivalent)
// so the signature can be verified against the unmodified bytes. Calling
// `req.json()` consumes the body and discards the raw form, making signature
// verification impossible — and any subsequent processing trusts an
// unauthenticated payload.
//
// Triggers when ALL of:
//   1. File path contains `/webhooks/` (route handler under app/api/.../webhooks/).
//   2. File contains `req.json()` or `request.json()` call.
//
// Silence with eslint-disable when the webhook vendor signs via header (rare;
// most signed webhooks need raw body).

const webhookVerifyBeforeParse = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Webhook route handlers must use req.text() (raw body) so signature verification works.",
    },
    schema: [],
    messages: {
      jsonInWebhook:
        "Webhook route called req.json() — signature verification needs the raw body. Use `await req.text()` and pass the string to the verifier (e.g. `stripe.webhooks.constructEvent(rawBody, sig, secret)`). Then JSON.parse the body if needed AFTER verification.",
    },
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    if (!filename.includes("/webhooks/")) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee?.type === "MemberExpression" &&
          callee.property?.type === "Identifier" &&
          callee.property.name === "json" &&
          callee.object?.type === "Identifier" &&
          /^(req|request)$/.test(callee.object.name)
        ) {
          context.report({ node, messageId: "jsonInWebhook" });
        }
      },
    };
  },
};


// ── Plugin export ────────────────────────────────────────────────────────────

const plugin = {
  meta: {
    name: "eslint-plugin-stage-engineering",
    version: "2.0.0",
  },
  rules: {
    // Original rules (v1)
    "no-backdrop-blur-content": noBackdropBlurContent,
    "no-glass-tokens": noGlassTokens,
    "no-neon-blue-accent": noNeonBlueAccent,
    "no-hardcoded-panel-radius": noHardcodedPanelRadius,
    // Design system enforcement (v2)
    "no-forbidden-classnames": noForbiddenClassnames,
    "no-legacy-css-vars": noLegacyCssVars,
    "no-raw-colors": noRawColors,
    "no-legacy-brand": noLegacyBrand,
    // Phase 3 Sprint 1 injection-safety enforcement
    "require-wrap-untrusted": requireWrapUntrusted,
    // Phase 3 Sprint 2 §3.5 C3 rail — confirm gate before dispatch
    "require-confirmed-before-dispatch": requireConfirmedBeforeDispatch,
    // Audit redesign 2026-04-29 — prospective security checks
    "no-mutation-without-authz": noMutationWithoutAuthz,
    "webhook-verify-before-parse": webhookVerifyBeforeParse,
  },
};

export default plugin;
