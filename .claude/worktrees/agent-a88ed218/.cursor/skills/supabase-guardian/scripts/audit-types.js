const fs = require('fs');
const path = require('path');

const TYPES_PATH = path.join(process.cwd(), 'src/types/supabase.ts');

function scanSignalArchitecture() {
  console.log("\x1b[36m%s\x1b[0m", "🛡️  Signal Guardian: Auditing V2 Architecture...\n");

  if (!fs.existsSync(TYPES_PATH)) {
    console.error(`❌ Types file not found at: ${TYPES_PATH}`);
    console.error("   Run 'npm run db:gen-types' (or equivalent) to generate them.");
    return;
  }

  const content = fs.readFileSync(TYPES_PATH, 'utf8');
  let passed = 0;
  let warned = 0;

  // 1. Multi-tenancy: workspace_id
  if (content.includes('workspace_id')) {
    console.log("✅ 'workspace_id' column detected (multi-tenancy present).");
    passed++;
  } else {
    console.warn("⚠️  WARNING: 'workspace_id' not found in types. Is multi-tenancy implemented?");
    warned++;
  }

  // 2. Workspace resolution helper
  if (content.includes('get_user_workspace_ids') || content.includes('get_my_workspace_ids')) {
    console.log("✅ Workspace resolution helper detected (get_user_workspace_ids or get_my_workspace_ids).");
    passed++;
  } else {
    console.warn("⚠️  WARNING: No workspace helper function in types. RLS may use inline subqueries.");
    warned++;
  }

  // 3. Entity-centric resolution
  if (content.includes('get_my_entity_id') || content.includes('signal_current_entity_id')) {
    console.log("✅ Entity resolution helper detected (get_my_entity_id / signal_current_entity_id).");
    passed++;
  } else if (content.includes('entities') && content.includes('affiliations')) {
    console.warn("⚠️  WARNING: Entity-centric tables exist but no entity resolution helper in types.");
    warned++;
  }

  // 4. Schema separation (V2 target)
  const schemas = ['directory', 'cortex', 'ops', 'finance'];
  const foundSchemas = schemas.filter((s) => content.includes(s));
  if (foundSchemas.length > 0) {
    console.log(`✅ V2 schemas found: ${foundSchemas.join(', ')}.`);
    passed++;
  } else {
    console.warn("⚠️  NOTE: V2 schemas (directory, cortex, ops) not in types. Current state: public + finance.");
    warned++;
  }

  // 5. Ghost Protocol (V2) vs. current (is_ghost)
  if (content.includes('owner_workspace_id')) {
    console.log("✅ 'owner_workspace_id' detected — Ghost Protocol (V2) in use.");
    passed++;
  } else if (content.includes('is_ghost')) {
    console.log("✅ 'is_ghost' detected — current Ghost model in use.");
    passed++;
  } else if (content.includes('entities')) {
    console.warn("⚠️  WARNING: 'entities' exists but neither 'owner_workspace_id' nor 'is_ghost' found.");
    warned++;
  }

  // 6. Cortex (V2): source_entity_id in relationships
  if (content.includes('cortex') && !content.includes('source_entity_id')) {
    console.error("❌ CRITICAL: 'cortex' schema present but 'source_entity_id' not found.");
  } else if (content.includes('cortex') && content.includes('source_entity_id')) {
    console.log("✅ Cortex relationships define source_entity_id.");
    passed++;
  }

  // 7. ops.assignments reminder (RLS gap - Supabase advisor catches this)
  if (content.includes('ops') && content.includes('assignments')) {
    console.log("ℹ️  NOTE: Verify ops.assignments has RLS policies. Run Supabase security advisor if available.");
  }

  console.log("\n✅ Audit complete. Remember: Trust the Schema, Distrust the Client.");
  if (warned > 0) {
    console.log(`   (${warned} advisory note(s). Manual verification of RLS in migrations is still required.)`);
  }
}

scanSignalArchitecture();
