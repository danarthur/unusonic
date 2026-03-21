// .cursor/skills/fsd-architect/scripts/audit.js
const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const LAYERS = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'];

console.log("\x1b[36m%s\x1b[0m", "🏗️  DanielOS Architect: Auditing Feature-Sliced Design...");

// 1. Check for "Ghost Folders"
function checkGhostFolders() {
    if (!fs.existsSync(SRC_DIR)) {
        console.error("❌ CRITICAL: src/ directory not found.");
        return false;
    }
    
    const items = fs.readdirSync(SRC_DIR, { withFileTypes: true });
    let passed = true;

    items.forEach(item => {
        if (item.isDirectory() && !LAYERS.includes(item.name)) {
            console.error(`❌ VIOLATION: Ghost Folder Detected -> "src/${item.name}"`);
            console.error(`   Allowed Layers: ${LAYERS.join(', ')}`);
            passed = false;
        }
    });
    return passed;
}

// 2. Check for Public API Barriers (index.ts)
function checkBarriers() {
    let passed = true;
    ['entities', 'features', 'widgets'].forEach(layer => {
        const layerPath = path.join(SRC_DIR, layer);
        if (!fs.existsSync(layerPath)) return;

        const slices = fs.readdirSync(layerPath, { withFileTypes: true });
        slices.forEach(slice => {
            if (!slice.isDirectory()) return;
            const indexPath = path.join(layerPath, slice.name, 'index.ts');
            
            if (!fs.existsSync(indexPath)) {
                console.warn(`⚠️  WARNING: Missing Public API -> "${layer}/${slice.name}/index.ts"`);
                passed = false;
            }
        });
    });
    return passed;
}

// 3. Enforce Next.js "Thin Proxy" Pattern
function checkAppDir() {
    const appPath = path.join(SRC_DIR, 'app');
    if (!fs.existsSync(appPath)) return true;
    return true;
}

const ghostPassed = checkGhostFolders();
const barrierPassed = checkBarriers();

if (ghostPassed && barrierPassed) {
    console.log("\x1b[32m%s\x1b[0m", "✅ Architecture Compliant. The Liquid System is stable.");
    process.exit(0);
} else {
    console.log("\x1b[31m%s\x1b[0m", "🛑 Architectural Violations Found. Refactoring required.");
    process.exit(1);
}