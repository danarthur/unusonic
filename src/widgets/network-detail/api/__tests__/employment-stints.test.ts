import { describe, it, expect } from 'vitest';
import { collapseStints, type EdgeRow } from '../employment-stints';

const edge = (
  company: string,
  type: string,
  started: string | null,
  ended: string | null,
  jobTitle?: string,
): EdgeRow => ({
  source_entity_id: 'p1',
  target_entity_id: company,
  relationship_type: type,
  context_data: jobTitle ? { job_title: jobTitle } : null,
  started_at: started,
  ended_at: ended,
});

const names = new Map([
  ['co1', 'Pure Lavish Events'],
  ['co2', 'Brandi Jane Events'],
]);

describe('collapseStints', () => {
  it('collapses the MEMBER + ROSTER_MEMBER pair into one stint', () => {
    // The real shape of current data: everyone holds both edges to one company.
    const out = collapseStints(
      [edge('co1', 'MEMBER', '2024-01-01', null), edge('co1', 'ROSTER_MEMBER', '2024-01-01', null)],
      names,
    );
    expect(out).toHaveLength(1);
    expect(out[0].companyName).toBe('Pure Lavish Events');
  });

  it('keeps two stints at the same company apart when one has ended', () => {
    // Rejoining a former employer is the case the unique constraint used to
    // make unrepresentable; it must not collapse into one row.
    const out = collapseStints(
      [
        edge('co1', 'MEMBER', '2020-01-01', '2022-06-01'),
        edge('co1', 'MEMBER', '2024-01-01', null),
      ],
      names,
    );
    expect(out).toHaveLength(2);
    expect(out.filter((s) => s.endedAt === null)).toHaveLength(1);
  });

  it('takes a job title from whichever edge carries one', () => {
    const out = collapseStints(
      [edge('co1', 'MEMBER', null, null), edge('co1', 'ROSTER_MEMBER', null, null, 'Lead Planner')],
      names,
    );
    expect(out[0].jobTitle).toBe('Lead Planner');
  });

  it('keeps the earliest start when two edges disagree', () => {
    // Edges written at different times shouldn't shorten a stint.
    const out = collapseStints(
      [edge('co1', 'ROSTER_MEMBER', '2024-05-01', null), edge('co1', 'MEMBER', '2023-01-01', null)],
      names,
    );
    expect(out[0].startedAt).toBe('2023-01-01');
  });

  it('skips companies the workspace cannot see rather than rendering a blank row', () => {
    const out = collapseStints([edge('unknown-co', 'MEMBER', null, null)], names);
    expect(out).toHaveLength(0);
  });

  it('separates concurrent affiliations to different companies', () => {
    const out = collapseStints(
      [edge('co1', 'MEMBER', null, null), edge('co2', 'MEMBER', null, null)],
      names,
    );
    expect(out.map((s) => s.companyName).sort()).toEqual([
      'Brandi Jane Events',
      'Pure Lavish Events',
    ]);
  });
});
