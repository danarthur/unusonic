export const DEPARTMENT_ORDER = ['Audio', 'Lighting', 'Video', 'Staging', 'Management', 'General'] as const;

export const SKILL_TO_DEPARTMENT: Record<string, string> = {
  'Sound Engineer': 'Audio',
  'Audio Engineer': 'Audio',
  'FOH Engineer': 'Audio',
  'Monitor Engineer': 'Audio',
  'A2': 'Audio',
  'Audio': 'Audio',
  'Lighting Designer': 'Lighting',
  'LD': 'Lighting',
  'Lighting Tech': 'Lighting',
  'Lighting': 'Lighting',
  'Video Engineer': 'Video',
  'Camera Operator': 'Video',
  'Video Tech': 'Video',
  'Video': 'Video',
  'Stage Manager': 'Staging',
  'Stagehand': 'Staging',
  'Rigger': 'Staging',
  'Staging': 'Staging',
  'Production Manager': 'Management',
  'Tour Manager': 'Management',
  'DJ': 'General',
  'MC': 'General',
  'Emcee': 'General',
};

export const DEFAULT_DEPARTMENT = 'General';

export function inferDepartment(roleNote: string | null, jobTitle: string | null): string {
  if (roleNote) {
    const match = SKILL_TO_DEPARTMENT[roleNote];
    if (match) return match;
  }
  if (jobTitle) {
    const match = SKILL_TO_DEPARTMENT[jobTitle];
    if (match) return match;
  }
  return DEFAULT_DEPARTMENT;
}
