-- Migration 1.1: Rename subscription_tier enum values
-- 4-tier (foundation/growth/venue_os/autonomous) → 3-tier (foundation/growth/studio)
-- Must handle: workspaces, agent_configs, AND commercial_organizations

BEGIN;

-- Step 1: Add the addon column first (default false)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS autonomous_addon_enabled boolean NOT NULL DEFAULT false;

-- Step 2: Flag workspaces that are currently on 'autonomous' BEFORE we lose that info
UPDATE workspaces
  SET autonomous_addon_enabled = true
  WHERE subscription_tier::text = 'autonomous';

-- Step 3: Drop column defaults that reference the enum type (prevents DROP TYPE failure)
ALTER TABLE workspaces ALTER COLUMN subscription_tier DROP DEFAULT;
ALTER TABLE commercial_organizations ALTER COLUMN subscription_tier DROP DEFAULT;

-- Step 4: Convert ALL columns using this enum to text
ALTER TABLE workspaces
  ALTER COLUMN subscription_tier TYPE text USING subscription_tier::text;

ALTER TABLE agent_configs
  ALTER COLUMN tier TYPE text USING tier::text;

ALTER TABLE commercial_organizations
  ALTER COLUMN subscription_tier TYPE text USING subscription_tier::text;

-- Step 5: Update legacy tier values → studio in all tables
UPDATE workspaces
  SET subscription_tier = 'studio'
  WHERE subscription_tier IN ('venue_os', 'autonomous');

UPDATE agent_configs
  SET tier = 'studio'
  WHERE tier IN ('venue_os', 'autonomous');

UPDATE commercial_organizations
  SET subscription_tier = 'studio'
  WHERE subscription_tier IN ('venue_os', 'autonomous');

-- Step 6: Drop old enum and recreate with new values
DROP TYPE subscription_tier;
CREATE TYPE subscription_tier AS ENUM ('foundation', 'growth', 'studio');

-- Step 7: Convert columns back to the new enum type
ALTER TABLE workspaces
  ALTER COLUMN subscription_tier TYPE subscription_tier USING subscription_tier::subscription_tier;

ALTER TABLE agent_configs
  ALTER COLUMN tier TYPE subscription_tier USING tier::subscription_tier;

ALTER TABLE commercial_organizations
  ALTER COLUMN subscription_tier TYPE subscription_tier USING subscription_tier::subscription_tier;

-- Step 8: Restore defaults with the new enum type
ALTER TABLE workspaces ALTER COLUMN subscription_tier SET DEFAULT 'foundation'::subscription_tier;
ALTER TABLE commercial_organizations ALTER COLUMN subscription_tier SET DEFAULT 'foundation'::subscription_tier;

COMMIT;
