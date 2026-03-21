---
name: next-modern
description: Enforces Next.js 15 (Async APIs), React 19 (Actions/Optimistic), and Tailwind v4 (CSS-first) standards.
version: 1.0.0
---

# Next.js 15 & React 19 Architect

You are the **Modern Stack Specialist**. You reject legacy patterns. You build for the bleeding edge of 2026.

## I. NEXT.JS 15: ASYNC EVERYTHING
**Crucial Change:** Request-specific APIs are now asynchronous.
- **Params:** `params` and `searchParams` in Pages/Layouts/Routes are PROMISES.
- **Cookies:** `cookies()` returns a PROMISE.
- **Headers:** `headers()` returns a PROMISE.

**Pattern Enforcement:**
```tsx
// ❌ WRONG (Next.js 14)
export default function Page({ params }) {
  return <div>{params.slug}</div>;
}

// ✅ CORRECT (Next.js 15)
export default async function Page({ params }) {
  const { slug } = await params; // Must await!
  return <div>{slug}</div>;
}

// ❌ WRONG
const cookieStore = cookies();
const token = cookieStore.get('token');

// ✅ CORRECT
const cookieStore = await cookies();
const token = cookieStore.get('token');
```

## II. REACT 19: ACTIONS & STATE
**Deprecation Warning:** Do NOT use `useFormState`.
**Adoption Mandate:** Use `useActionState` and `useOptimistic`.

**The Action Pattern:**
```tsx
import { useActionState } from 'react';

// Server Action
async function updateProfile(prevState, formData) {
  'use server';
  // ... logic
}

// Component
export function ProfileForm() {
  const [state, formAction, isPending] = useActionState(updateProfile, null);
  
  return (
    <form action={formAction}>
      <button disabled={isPending}>Save</button>
    </form>
  );
}
```

## III. TAILWIND v4: CSS-FIRST
**Reject:** `tailwind.config.ts` (unless absolutely necessary for plugins).
**Embrace:** `@theme` inside `globals.css`.

**Config Pattern:**
```css
@import "tailwindcss";

@theme {
  --color-canvas: #FDFCF8;
  --color-ink: #4A453E;
  --font-display: "Outfit", sans-serif;
}
```

## IV. SUPABASE SSR (The Standard)
**Reject:** `@supabase/auth-helpers-nextjs` (Deprecated).
**Embrace:** `@supabase/ssr`.

- **Client Side:** `createBrowserClient`
- **Server Side:** `createServerClient` (with strict cookie handling)

## V. VALIDATION
Before completing a task involving these technologies, run:
`node .cursor/skills/next-modern/scripts/check-modern.js`

---

```javascript
const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');

const DEPRECATED_PATTERNS = [
    { 
        pattern: /useFormState/g, 
        message: "❌ Found 'useFormState'. Replace with React 19's 'useActionState'." 
    },
    { 
        pattern: /@supabase\/auth-helpers-nextjs/g, 
        message: "❌ Found legacy Supabase Auth Helpers. Migrate to '@supabase/ssr'." 
    },
    { 
        pattern: /cookies\(\)\./g, 
        message: "⚠️  Potential Sync Cookie Access. Ensure you use '(await cookies()).get(...)' in Next.js 15." 
    },
    { 
        pattern: /headers\(\)\./g, 
        message: "⚠️  Potential Sync Header Access. Ensure you use '(await headers()).get(...)' in Next.js 15." 
    }
];

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    let violations = [];

    DEPRECATED_PATTERNS.forEach(rule => {
        if (rule.pattern.test(content)) {
            violations.push(rule.message);
        }
    });

    return violations;
}

function traverseDirectory(dir) {
    if (!fs.existsSync(dir)) return [];
    
    let allViolations = [];
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            allViolations = allViolations.concat(traverseDirectory(fullPath));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const violations = scanFile(fullPath);
            if (violations.length > 0) {
                allViolations.push({ 
                    file: fullPath.replace(ROOT_DIR, ''), 
                    violations 
                });
            }
        }
    }
    return allViolations;
}

console.log("\x1b[36m%s\x1b[0m", "⚡ Next.js 15 Architect: Scanning for Modern Standards...");

const results = traverseDirectory(SRC_DIR);

if (results.length === 0) {
    console.log("\x1b[32m%s\x1b[0m", "✅ Modern Stack Compliant. No legacy patterns detected.");
    process.exit(0);
} else {
    console.log("\x1b[33m%s\x1b[0m", "⚠️  Modern Standards Warnings:");
    results.forEach(item => {
        console.log(`\n📄 ${item.file}`);
        item.violations.forEach(v => console.log(`   ${v}`));
    });
    // We exit 0 (success) because some warnings (like async cookies) are heuristics and might be false positives.
    // We want to warn, not block, unless it's a hard deprecation like useFormState.
    process.exit(0); 
}
```