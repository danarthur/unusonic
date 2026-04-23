-- Rename PARTNER → INDUSTRY_PARTNER in cortex.relationships
-- PARTNER was too generic; INDUSTRY_PARTNER is explicit about meaning
-- (referral network, production companies, industry contacts — not employees or clients)

UPDATE cortex.relationships
SET relationship_type = 'INDUSTRY_PARTNER'
WHERE relationship_type = 'PARTNER';
