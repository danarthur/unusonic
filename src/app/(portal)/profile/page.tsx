/**
 * My Profile — employee portal.
 * View and edit own information. Admin-controlled fields are read-only.
 */

import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { ProfileView } from './profile-view';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve person entity
  const { data: personEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, avatar_url, attributes')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!personEntity) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
        <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          No profile linked
        </h1>
        <p className="text-sm text-[var(--stage-text-secondary)] max-w-md">
          Your account is not linked to a team member profile yet. Contact your manager.
        </p>
      </div>
    );
  }

  const attrs = readEntityAttrs(personEntity.attributes, 'person');

  // Get ROSTER_MEMBER edge for employment context
  const { data: rosterEdge } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('context_data')
    .eq('source_entity_id', personEntity.id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .limit(1)
    .maybeSingle();

  const ctx = (rosterEdge?.context_data ?? {}) as Record<string, unknown>;

  // Get skills
  const { data: skills } = await supabase
    .schema('ops')
    .from('crew_skills')
    .select('skill_tag, proficiency')
    .eq('entity_id', personEntity.id)
    .order('skill_tag');

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
          My profile
        </h1>
        <p className="mt-1 text-sm text-[var(--stage-text-secondary)]">
          View your information. Some fields are managed by your team admin.
        </p>
      </div>
      <ProfileView
        entityId={personEntity.id}
        displayName={personEntity.display_name}
        avatarUrl={personEntity.avatar_url}
        attrs={attrs}
        employmentContext={{
          jobTitle: (ctx.job_title as string) ?? null,
          role: (ctx.role as string) ?? null,
          employmentStatus: (ctx.employment_status as string) ?? null,
          defaultHourlyRate: (ctx.default_hourly_rate as number) ?? null,
        }}
        skills={(skills ?? []).map(s => ({
          tag: s.skill_tag,
          proficiency: s.proficiency,
        }))}
      />
    </div>
  );
}
