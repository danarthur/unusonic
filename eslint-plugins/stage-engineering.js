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
  [/\b(bg|text|border)-(gray|slate|zinc|neutral|stone)-\d+\b/, null, "Use --stage-surface-* or OKLCH tokens instead of raw gray scales"],
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
  },
};

export default plugin;
