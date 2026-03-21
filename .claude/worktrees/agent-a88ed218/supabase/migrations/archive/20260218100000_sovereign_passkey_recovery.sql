-- Sovereign Passkey & Recovery Foundation
-- Compliant with Supabase Guardian: RLS on all tables, additive-safe profiles.
-- See docs/passkey-sovereign-recovery-analysis.md for rationale and alternatives.

-- 1. PROFILES (create only if not exists; additive for existing codebase)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  has_recovery_kit boolean DEFAULT false,
  recovery_setup_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- 2. WEB AUTHN CHALLENGES (short-lived; for registration/authentication)
CREATE TABLE public.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. PASSKEYS
CREATE TABLE public.passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text UNIQUE NOT NULL,
  public_key text NOT NULL,
  counter integer DEFAULT 0,
  transports text[],
  created_at timestamptz DEFAULT now()
);

-- 4. GUARDIANS
CREATE TYPE public.guardian_status AS ENUM ('pending', 'active');

CREATE TABLE public.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guardian_email text NOT NULL,
  status public.guardian_status DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE(owner_id, guardian_email)
);

-- 5. RECOVERY SHARDS
CREATE TABLE public.recovery_shards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  encrypted_shard text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 6. RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_shards ENABLE ROW LEVEL SECURITY;

-- Profiles: own row only
CREATE POLICY "Users manage own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Challenges: own rows only (create/read/delete for ceremony)
CREATE POLICY "Users manage own webauthn challenges"
  ON public.webauthn_challenges FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Passkeys: own rows only
CREATE POLICY "Users manage own passkeys"
  ON public.passkeys FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Guardians: own rows only
CREATE POLICY "Users manage own guardians"
  ON public.guardians FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Recovery shards: owner full access; guardian read-only
CREATE POLICY "Owners full access to own shards"
  ON public.recovery_shards FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Guardians can read shards assigned to them"
  ON public.recovery_shards FOR SELECT
  USING (
    auth.email() = (SELECT guardian_email FROM public.guardians WHERE id = guardian_id)
  );
