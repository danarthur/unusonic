const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');

// The "Modern Stack" Enforcers
const RULES = [
    { 
        id: 'react-19-actions',
        pattern: /useFormState\(/g, 
        level: 'error',
        message: "❌ DEPRECATED: 'useFormState' found. React 19 requires 'useActionState'." 
    },
    { 
        id: 'supabase-ssr',
        pattern: /@supabase\/auth-helpers-nextjs/g, 
        level: 'error',
        message: "❌ DEPRECATED: Legacy Supabase Auth Helpers found. Migrate to '@supabase/ssr'." 
    },
    { 
        id: 'next-15-cookies',
        // Looks for cookies().get or cookies().set immediately (synchronous usage)
        pattern: /cookies\(\)\./g, 
        level: 'warning',
        message: "⚠️  Next.js 15 Warning: 'cookies()' is now a Promise. Use '(await cookies()).get(...)'." 
    },
    { 
        id: 'next-15-headers',
        pattern: /headers\(\)\./g, 
        level: 'warning',
        message: "⚠️  Next.js 15 Warning: 'headers()' is now a Promise. Use '(await headers()).get(...)'." 
    },
    {
        id: 'no-hardcoded-secrets',
        pattern: /process\.env\.NEXT_PUBLIC_[A-Z_]+_KEY/g,
        level: 'info',
        message: "ℹ️  Security Note: Ensure exposed env vars (NEXT_PUBLIC) do not contain sensitive keys."
    }
];

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    let issues = [];

    RULES.forEach(rule => {
        if (rule.pattern.test(content)) {
            issues.push({
                level: rule.level,
                message: rule.message
            });
        }
    });

    return issues;
}

function traverseDirectory(dir) {
    if (!fs.existsSync(dir)) return [];
    
    let findings = [];
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            findings = findings.concat(traverseDirectory(fullPath));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const issues = scanFile(fullPath);
            if (issues.length > 0) {
                findings.push({ 
                    file: fullPath.replace(ROOT_DIR, ''), 
                    issues 
                });
            }
        }
    }
    return findings;
}

console.log("\x1b[36m%s\x1b[0m", "⚡ Next.js 15 Architect: Scanning for Modern Standards...");

const results = traverseDirectory(SRC_DIR);
let errorCount = 0;

if (results.length === 0) {
    console.log("\x1b[32m%s\x1b[0m", "✅ Modern Stack Compliant. No legacy patterns detected.");
    process.exit(0);
} else {
    results.forEach(item => {
        console.log(`\n📄 ${item.file}`);
        item.issues.forEach(issue => {
            if (issue.level === 'error') errorCount++;
            console.log(`   ${issue.message}`);
        });
    });

    if (errorCount > 0) {
        console.log("\x1b[31m%s\x1b[0m", `\n🛑 Failed: ${errorCount} critical deprecation errors found.`);
        process.exit(1);
    } else {
        console.log("\x1b[33m%s\x1b[0m", "\n⚠️  Warnings found, but proceeding (Review Next.js 15 Async migrations).");
        process.exit(0);
    }
}