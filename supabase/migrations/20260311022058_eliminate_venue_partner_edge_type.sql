/**
 * Eliminate VENUE_PARTNER as a distinct cortex relationship_type.
 * Per Gemini Two-System architecture: venues are INDUSTRY_PARTNER nodes
 * with a "venue" category tag — not a separate connection type.
 *
 * Migrates existing VENUE_PARTNER edges → INDUSTRY_PARTNER, preserving all
 * context_data and adding industry_tags = ["venue"] if not already set.
 */

UPDATE cortex.relationships
SET
  relationship_type = 'INDUSTRY_PARTNER',
  context_data = CASE
    -- If context_data already has industry_tags array, prepend 'venue' only if absent
    WHEN context_data ? 'industry_tags'
      AND NOT (context_data->'industry_tags' @> '"venue"'::jsonb)
    THEN context_data || jsonb_build_object(
           'industry_tags',
           jsonb_build_array('venue') || (context_data->'industry_tags')
         )
    -- If no industry_tags key at all, add it with ["venue"]
    WHEN NOT (context_data ? 'industry_tags')
    THEN context_data || '{"industry_tags": ["venue"]}'::jsonb
    -- Already has "venue" in tags — just update the type
    ELSE context_data
  END
WHERE relationship_type = 'VENUE_PARTNER';
