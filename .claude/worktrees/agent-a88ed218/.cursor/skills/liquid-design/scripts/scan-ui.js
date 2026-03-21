const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');

// The "Admin Panel" Anti-Patterns
// We flag these because they break the "Liquid Ceramic" immersion.
const FORBIDDEN_TOKENS = [
    { 
        pattern: /bg-white(?![a-zA-Z0-9-])/g, 
        message: "❌ Found 'bg-white'. Use 'bg-obsidian' (Page) or '.liquid-card' (Card)." 
    },
    { 
        pattern: /bg-gray-[1-9]00/g, 
        message: "❌ Found 'bg-gray-*'. Use semantic 'bg-sidebar', 'bg-stone', or '.liquid-panel'." 
    },
    { 
        pattern: /text-gray-[1-9]00/g, 
        message: "❌ Found 'text-gray-*'. Use 'text-ink' (Primary) or 'text-ink-muted' (Secondary)." 
    },
    { 
        pattern: /shadow-(sm|md|lg|xl)/g, 
        message: "❌ Found default Tailwind shadow. Use '.liquid-card' or '.liquid-panel' (shadow is baked in)." 
    },
    { 
        pattern: /border-gray-[1-9]00/g, 
        message: "❌ Found 'border-gray-*'. Use 'border-white/10' or semantic borders." 
    }
];

// Exceptions (files where we might need raw values)
const EXCLUDED_FILES = ['globals.css', 'tailwind.config.ts', 'tailwind.config.js'];

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    let violations = [];

    FORBIDDEN_TOKENS.forEach(rule => {
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
        } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
            // Check if file is excluded
            if (EXCLUDED_FILES.some(ex => fullPath.endsWith(ex))) continue;
            
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

console.log("\x1b[36m%s\x1b[0m", "🎨 DanielOS Design Architect: Scanning for Aesthetic Violations...");

const results = traverseDirectory(SRC_DIR);

if (results.length === 0) {
    console.log("\x1b[32m%s\x1b[0m", "✅ Liquid Design Compliant. No 'Admin Panel' artifacts found.");
    process.exit(0);
} else {
    console.log("\x1b[31m%s\x1b[0m", "🛑 Aesthetic Violations Detected:");
    results.forEach(item => {
        console.log(`\n📄 ${item.file}`);
        item.violations.forEach(v => console.log(`   ${v}`));
    });
    console.log("\n💡 Action: Replace generic tokens with 'liquid-*' classes or semantic colors.");
    // We exit with error to fail the build/commit if you use this in CI
    process.exit(1);
}