/**
 * Shared types for the proposal-builder studio + its split sub-components.
 *
 * These were inline in proposal-builder-studio.tsx until the file size
 * began blocking Vercel's typecheck (12+ min). Extracted to keep the main
 * studio file lean and let split sub-components (team-picker, line-inspector,
 * catalog-picker) reference them without circular imports.
 */

export type DemoLine = {
  label: string;
  qty?: string;
  amount: number | 'included';
};

export type DemoBlock = {
  title: string;
  summary: string;
  subtotal: number;
  lines: DemoLine[];
  /** Highest sort_order among this block's proposal_items. Used to position
   *  new items inserted "below" this block. undefined for demo data. */
  maxSortOrder?: number;
  /** The header row's own sort_order — the "entry point" for swap and for
   *  any operation that wants to place something at this block's position
   *  rather than after its children. */
  headerSortOrder?: number;
  /** proposal_item.id of this block's header row. undefined for demo data. */
  headerItemId?: string;
  /** origin_package_id / package_id of the header — matches ops.deal_crew.catalog_item_id
   *  so we can link required-role rows to this block. null for a-la-carte / demo. */
  catalogItemId?: string | null;
  /** origin_package_id of every child row under this header. Required-role crew
   *  lives on the ingredients for bundles — e.g. Gold Package header has no
   *  crew_meta, but its DJ child and Chauvet child do — so the LineInspector
   *  must look up deal_crew rows keyed to any of these ids, not just the header. */
  childCatalogItemIds?: string[];
  /** package_instance_id shared by a bundle's header + children. When set +
   *  isHeader=true, Unpack and whole-bundle Delete become available. */
  packageInstanceId?: string | null;
  /** True when the header row is the is_package_header=true row of a bundle. */
  isHeader?: boolean;
  /** Editable fields — persist via updateProposalItem. Seeded from the header row. */
  quantity?: number;
  overridePrice?: number | null;
  unitPrice?: number;
  internalNotes?: string | null;
  /** Expected cost per unit, baked from the catalog's target_cost at add time.
   *  For bundle headers this is the SUMMED child cost (children carry the real
   *  cost; the header has none of its own) — read-only display.
   *  For a-la-carte / single-item package rows this is the row's own
   *  actual_cost — editable via the Est. cost input. */
  actualCost?: number | null;
  /** When true, cost is computed from children (bundle header) and the Est.
   *  cost input should be read-only with a "Sum of ingredients" note. */
  costIsComputed?: boolean;
  /** Catalog category of the header row's package, e.g. 'package' / 'rental' / 'service'.
   *  Drives the small category pill in the inspector header. */
  category?: string | null;
  /** Catalog unit type — 'flat' / 'hour' / 'day'. Read-only here (catalog-level
   *  concept; changing it mid-proposal would reshape the math contract). */
  unitType?: string | null;
  /** For 'hour' / 'day' items: how many hours/days this line represents. Editable
   *  per proposal — a service with a catalog default of 8 hours can be bumped to
   *  10 for a long night. Scales both revenue and cost. */
  unitMultiplier?: number | null;
  /** Cached effective multiplier: unitMultiplier when unitType is hour/day, else 1.
   *  Computed once in the reducer so downstream consumers don't re-derive it. */
  effectiveMultiplier?: number;
  /** When true, the client sees a checkbox on this line and can decline it.
   *  Not shown on the scope pill unless isClientVisible is also true. */
  isOptional?: boolean;
  /** When false, this line is hidden from the client-facing proposal entirely.
   *  Still visible + editable in the builder; still counted in margin math. */
  isClientVisible?: boolean;
};
