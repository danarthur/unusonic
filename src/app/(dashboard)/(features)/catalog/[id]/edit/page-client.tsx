/**
 * Catalog item edit — Simple form for ingredients (Service, Rental, Talent, Retail, Fee).
 * Route: /catalog/[id]/edit
 * Package (bundle) items can open the Builder from here.
 */

'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { StagePanel } from '@/shared/ui/stage-panel';
import {
  getPackage,
  updatePackage,
  getCatalogPackagesWithTags,
} from '@/features/sales/api/package-actions';
import {
  getCatalogItemAssignees,
  addCatalogItemAssignee,
  addCatalogRoleAssignee,
  removeCatalogItemAssignee,
  type CatalogAssigneeRow,
} from '@/features/sales/api/catalog-assignee-actions';
import { listWorkspaceJobTitles } from '@/features/talent-management/api/job-title-actions';
import { searchNetworkOrgs } from '@/features/network-data';
import type { NetworkSearchOrg } from '@/features/network-data';
import type {
  PackageWithTags,
  PackageCategory,
  IngredientMeta,
  PackageDefinition,
  PackageTag,
} from '@/features/sales/api/package-actions';
import {
  getWorkspaceTags,
  createWorkspaceTag,
  type WorkspaceTag,
} from '@/features/sales/api/workspace-tag-actions';
import { SmartTagInput } from '@/shared/ui/smart-tag-input';
import { cn } from '@/shared/lib/utils';
import { CatalogImageUpload } from '../../components/catalog-image-upload';
// Sub-components live under ./page-client/ — split out 2026-04-29.
import { CATEGORIES, inputClass, labelClass } from './page-client/shared';
import { PricingFields } from './page-client/pricing-fields';
import {
  ServiceTalentSection,
  BillingTypeSection,
  RentalInventorySection,
  RentalAlternativesSection,
  RetailSection,
  BundleCTA,
} from './page-client/category-sections';
import { DefaultCrewSection } from './page-client/crew-section';

export default function CatalogEditPageClient() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : null;
  const { workspaceId, hasWorkspace } = useWorkspace();
  const [pkg, setPkg] = useState<PackageWithTags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PackageCategory>('package');
  const [price, setPrice] = useState('');
  const [floorPrice, setFloorPrice] = useState('');
  const [targetCost, setTargetCost] = useState('');
  const [selectedTags, setSelectedTags] = useState<WorkspaceTag[]>([]);
  const [durationHours, setDurationHours] = useState('');
  const [performanceSetCount, setPerformanceSetCount] = useState('');
  const [staffRole, setStaffRole] = useState('');
  /** Proposal Builder consumer: when checked, the staff role slot counts
   *  toward the Send button's "N required roles still open" warning and
   *  shows an asterisk on required-role chips. Explicit opt-in — undefined
   *  is treated as not required, so historical packages don't start nagging. */
  const [requiredRole, setRequiredRole] = useState(false);
  const [stockQuantity, setStockQuantity] = useState('');
  const [bufferPercent, setBufferPercent] = useState('');
  const [isSubRental, setIsSubRental] = useState(false);
  const [replacementCost, setReplacementCost] = useState('');
  const [bufferDays, setBufferDays] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [unitType, setUnitType] = useState<'flat' | 'hour' | 'day'>('flat');
  const [unitMultiplier, setUnitMultiplier] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Default crew state
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<CatalogAssigneeRow[]>([]);
  const [inheritedAssignees, setInheritedAssignees] = useState<
    (CatalogAssigneeRow & { ingredient_name: string })[]
  >([]);
  const [crewMode, setCrewMode] = useState<'person' | 'role'>('person');
  const [crewSearch, setCrewSearch] = useState('');
  const [crewResults, setCrewResults] = useState<NetworkSearchOrg[]>([]);
  const [crewSearchLoading, setCrewSearchLoading] = useState(false);
  const [crewPickerOpen, setCrewPickerOpen] = useState(false);
  const [roleInput, setRoleInput] = useState('');
  const [roleAdding, setRoleAdding] = useState(false);
  const crewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Alternatives state (rental items only)
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [altSearchOpen, setAltSearchOpen] = useState(false);
  const [altSearchQuery, setAltSearchQuery] = useState('');
  const [allRentalPackages, setAllRentalPackages] = useState<PackageWithTags[]>([]);

  const loadPackage = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getPackage(id);
      setPkg(result.package ?? null);
      setError(result.error ?? null);
      if (result.package) {
        const p = result.package;
        setName(p.name);
        setDescription(p.description ?? '');
        setCategory((p.category as PackageCategory) ?? 'package');
        setPrice(String(Number(p.price)));
        setFloorPrice(p.floor_price != null ? String(Number(p.floor_price)) : '');
        setTargetCost(p.target_cost != null ? String(Number(p.target_cost)) : '');
        setSelectedTags(
          (p.tags ?? []).map((t: PackageTag) => ({ ...t, workspace_id: p.workspace_id })),
        );
        const pkgAny = p as PackageWithTags & { unit_type?: string; unit_multiplier?: number };
        setUnitType(
          pkgAny.unit_type === 'hour' || pkgAny.unit_type === 'day' ? pkgAny.unit_type : 'flat',
        );
        setUnitMultiplier(
          pkgAny.unit_multiplier != null && pkgAny.unit_multiplier > 1
            ? String(pkgAny.unit_multiplier)
            : '',
        );
        setImageUrl((p as PackageWithTags & { image_url?: string | null }).image_url ?? null);
        const meta = (p.definition as { ingredient_meta?: IngredientMeta } | null)?.ingredient_meta;
        if (meta) {
          setDurationHours(meta.duration_hours != null ? String(meta.duration_hours) : '');
          setPerformanceSetCount(
            meta.performance_set_count != null ? String(meta.performance_set_count) : '',
          );
          setStaffRole(meta.staff_role ?? '');
          setBufferPercent(meta.buffer_percent != null ? String(meta.buffer_percent) : '');
          setContactInfo(meta.contact_info ?? '');
        } else {
          setDurationHours('');
          setPerformanceSetCount('');
          setStaffRole('');
          setBufferPercent('');
          setContactInfo('');
        }
        // Seed the "Required role" checkbox from the matching entry in
        // required_roles[] — the single staff_role is our one-role editor;
        // we look up its required flag by name (case-insensitive).
        const existingRoles =
          (p.definition as { required_roles?: Array<{ role?: string; required?: boolean }> } | null)
            ?.required_roles ?? [];
        const staffRoleLower = (meta?.staff_role ?? '').toLowerCase().trim();
        const matchingRole = staffRoleLower
          ? existingRoles.find((r) => (r?.role ?? '').toLowerCase().trim() === staffRoleLower)
          : undefined;
        setRequiredRole(matchingRole?.required === true);
        const pkgRow = p as PackageWithTags & {
          stock_quantity?: number;
          is_sub_rental?: boolean;
          replacement_cost?: number | null;
          buffer_days?: number;
        };
        if ((p.category as string) === 'rental') {
          setStockQuantity(
            pkgRow.stock_quantity != null
              ? String(pkgRow.stock_quantity)
              : meta?.stock_quantity != null
                ? String(meta.stock_quantity)
                : '',
          );
          setIsSubRental(pkgRow.is_sub_rental === true);
          setReplacementCost(
            pkgRow.replacement_cost != null ? String(Number(pkgRow.replacement_cost)) : '',
          );
          setBufferDays(pkgRow.buffer_days != null ? String(pkgRow.buffer_days) : '');
        } else if ((p.category as string) === 'retail_sale' && meta) {
          setStockQuantity(meta.stock_quantity != null ? String(meta.stock_quantity) : '');
        } else {
          setStockQuantity('');
          setIsSubRental(false);
          setReplacementCost('');
          setBufferDays('');
        }
        // Initialize alternatives
        const existingAlts = (p.definition as Record<string, unknown> | null)?.alternatives as
          | string[]
          | undefined;
        setAlternatives(existingAlts ?? []);
      }
    } catch (e) {
      setPkg(null);
      setError(e instanceof Error ? e.message : 'Failed to load item.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadPackage();
  }, [loadPackage]);

  // Load assignees, inherited crew, and job titles separately (non-blocking)
  useEffect(() => {
    if (!id) return;
    getCatalogItemAssignees(id).then(setAssignees);
    listWorkspaceJobTitles().then(setJobTitles);
  }, [id]);

  // Load all rental packages for alternatives picker
  useEffect(() => {
    if (!workspaceId || category !== 'rental') {
      setAllRentalPackages([]);
      return;
    }
    getCatalogPackagesWithTags(workspaceId).then((result) => {
      const rentals = (result.packages ?? []).filter(
        (p) => p.category === 'rental' && p.is_active && p.id !== id,
      );
      setAllRentalPackages(rentals);
    });
  }, [workspaceId, category, id]);

  // For bundle packages: load crew inherited from ingredient items
  useEffect(() => {
    if (!id || !pkg || pkg.category !== 'package') {
      setInheritedAssignees([]);
      return;
    }
    const def = pkg.definition as { blocks?: { type: string; catalogId?: string }[] } | null;
    const ingredientIds = [
      ...new Set(
        (def?.blocks ?? [])
          .filter((b) => b.type === 'line_item' && b.catalogId)
          .map((b) => b.catalogId as string),
      ),
    ];
    if (!ingredientIds.length) {
      setInheritedAssignees([]);
      return;
    }

    Promise.all(
      ingredientIds.map(async (ingId) => {
        const [rows, ingPkg] = await Promise.all([getCatalogItemAssignees(ingId), getPackage(ingId)]);
        const ingName = ingPkg.package?.name ?? 'Ingredient';
        return rows.map((r) => ({ ...r, ingredient_name: ingName }));
      }),
    ).then((nested) => setInheritedAssignees(nested.flat()));
  }, [id, pkg]);

  const handleCrewSearch = useCallback(
    (q: string) => {
      setCrewSearch(q);
      if (crewDebounceRef.current) clearTimeout(crewDebounceRef.current);
      if (q.trim().length < 1) {
        setCrewResults([]);
        return;
      }
      // sourceOrgId for searchNetworkOrgs: use workspaceId as proxy (org root entity)
      // This matches the pattern used elsewhere — workspaceId is passed, server resolves the entity
      const orgId = workspaceId;
      if (!orgId) return;
      crewDebounceRef.current = setTimeout(async () => {
        setCrewSearchLoading(true);
        const r = await searchNetworkOrgs(orgId, q);
        setCrewResults(r);
        setCrewSearchLoading(false);
      }, 250);
    },
    [workspaceId],
  );

  const handleAddAssignee = async (org: NetworkSearchOrg) => {
    if (!id) return;
    const entityId = org.entity_uuid ?? org.id;
    const result = await addCatalogItemAssignee(id, entityId);
    if (result.success) {
      setAssignees(await getCatalogItemAssignees(id));
      setCrewSearch('');
      setCrewResults([]);
      setCrewPickerOpen(false);
      toast.success(`${org.name} added to default crew`);
    } else {
      toast.error(result.error);
    }
  };

  const handleRemoveAssignee = async (assigneeRowId: string) => {
    const result = await removeCatalogItemAssignee(assigneeRowId);
    if (result.success) {
      setAssignees((prev) => prev.filter((a) => a.id !== assigneeRowId));
    }
  };

  const handleAddRole = async () => {
    if (!id || !roleInput.trim()) return;
    setRoleAdding(true);
    const role = roleInput.trim();
    const result = await addCatalogRoleAssignee(id, role);
    if (result.success) {
      setAssignees(await getCatalogItemAssignees(id));
      setRoleInput('');
      toast.success(`${role} added to default crew`);
    } else {
      toast.error(result.error);
    }
    setRoleAdding(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !workspaceId) return;
    setFormError(null);
    const nameTrim = name.trim();
    if (!nameTrim) {
      setFormError('Name is required.');
      return;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setFormError('Price must be a non-negative number.');
      return;
    }
    if (category === 'rental') {
      const qty = Number(stockQuantity);
      if (!Number.isFinite(qty) || qty < 0) {
        setFormError('Total stock quantity is required for rentals (use 0 if you sub-rent only).');
        return;
      }
    }
    const tagIds = selectedTags.map((t) => t.id);
    const isBundle = category === 'package';
    const existingDef = (pkg?.definition ?? null) as Record<string, unknown> | null;
    const isServiceOrTalent = category === 'service' || category === 'talent';
    const ingredient_meta: IngredientMeta | undefined = isBundle
      ? undefined
      : {
          duration_hours:
            isServiceOrTalent && durationHours.trim() ? Number(durationHours) || null : null,
          performance_set_count:
            isServiceOrTalent && performanceSetCount.trim()
              ? Number(performanceSetCount) || null
              : null,
          staff_role: isServiceOrTalent && staffRole.trim() ? staffRole : null,
          stock_quantity:
            category === 'retail_sale' && stockQuantity.trim() ? Number(stockQuantity) || null : null,
          buffer_percent:
            category === 'retail_sale' && bufferPercent.trim()
              ? Number(bufferPercent) || null
              : null,
          contact_info: isServiceOrTalent && contactInfo.trim() ? contactInfo : null,
        };
    // Sync the Required checkbox into required_roles[]. For service/talent
    // packages with a staff_role selected: find the matching entry in the
    // array and set/clear its `required` flag. If no entry exists yet (common
    // for packages never touched by required_roles management), create a
    // minimal one so the flag has somewhere to live. Non-service/talent
    // categories and packages without a staff_role pass the array through.
    const existingRequiredRoles = Array.isArray(
      (existingDef as { required_roles?: unknown })?.required_roles,
    )
      ? (existingDef as { required_roles: Array<Record<string, unknown>> }).required_roles
      : null;
    let nextRequiredRoles: Array<Record<string, unknown>> | null = existingRequiredRoles;
    if (isServiceOrTalent && staffRole.trim()) {
      const staffRoleLower = staffRole.trim().toLowerCase();
      const arr = existingRequiredRoles ? [...existingRequiredRoles] : [];
      const matchIdx = arr.findIndex(
        (r) => String(r?.role ?? '').toLowerCase().trim() === staffRoleLower,
      );
      if (matchIdx >= 0) {
        arr[matchIdx] = { ...arr[matchIdx], required: requiredRole };
      } else {
        // No entry for this role yet — seed a minimal one so the flag persists.
        // booking_type mirrors the package category (service → labor, talent → talent).
        arr.push({
          role: staffRole.trim(),
          booking_type: category === 'talent' ? 'talent' : 'labor',
          quantity: 1,
          required: requiredRole,
        });
      }
      nextRequiredRoles = arr;
    }

    const definition = isBundle
      ? ((existingDef as unknown as PackageDefinition) ?? undefined)
      : ({
          layout: (existingDef as { layout?: string })?.layout,
          blocks: Array.isArray((existingDef as { blocks?: unknown })?.blocks)
            ? (existingDef as { blocks: unknown[] }).blocks
            : [],
          staffing: (existingDef as { staffing?: unknown })?.staffing ?? null,
          required_roles: nextRequiredRoles,
          ingredient_meta,
          ...(category === 'rental' && alternatives.length > 0 ? { alternatives } : {}),
        } as PackageDefinition);

    const floorPriceValue = isBundle
      ? null
      : floorPrice.trim()
        ? Number(floorPrice) || null
        : null;
    const targetCostValue = isBundle
      ? null
      : targetCost.trim()
        ? Number(targetCost) || null
        : null;
    const rentalPayload =
      category === 'rental'
        ? {
            stock_quantity: Number(stockQuantity) || 0,
            is_sub_rental: isSubRental,
            replacement_cost: replacementCost.trim() ? Number(replacementCost) || null : null,
            buffer_days: bufferDays.trim() ? Math.max(0, Math.floor(Number(bufferDays) || 0)) : 0,
          }
        : {};
    setSaving(true);
    const result = await updatePackage(id, {
      name: nameTrim,
      description: description.trim() || null,
      category,
      price: priceNum,
      floor_price: floorPriceValue,
      target_cost: targetCostValue,
      unit_type: isBundle ? 'flat' : unitType,
      unit_multiplier: unitMultiplier.trim() ? Number(unitMultiplier) || null : null,
      tagIds: tagIds.length ? tagIds : null,
      definition: definition ?? null,
      image_url: imageUrl,
      ...rentalPayload,
    });
    setSaving(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    if (result.package) setPkg(result.package);
    router.push('/catalog');
  };

  if (!hasWorkspace || !workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-[var(--stage-text-secondary)]">
        <p className="text-sm">Select a workspace to edit catalog items.</p>
        <Link
          href="/catalog"
          className="mt-4 text-sm text-[var(--stage-accent)] hover:underline"
        >
          Back to catalog
        </Link>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-[var(--stage-text-secondary)]">
        <p className="text-sm">Missing item.</p>
        <Link
          href="/catalog"
          className="mt-4 text-sm text-[var(--stage-accent)] hover:underline"
        >
          Back to catalog
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-[var(--stage-text-secondary)]">
        <p className="text-sm">Loading item…</p>
      </div>
    );
  }

  if (error || !pkg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-[var(--stage-text-secondary)]">
        <p className="text-sm text-[var(--color-unusonic-error)]">{error ?? 'Item not found.'}</p>
        <Link
          href="/catalog"
          className="mt-4 text-sm text-[var(--stage-accent)] hover:underline"
        >
          Back to catalog
        </Link>
      </div>
    );
  }

  const isBundle = category === 'package';

  return (
    <div className="flex flex-col min-h-0 flex-1 p-6 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-4 shrink-0 mb-6">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
        >
          <ChevronLeft size={18} strokeWidth={1.5} aria-hidden />
          Catalog
        </Link>
        <h1 className="text-xl font-medium text-[var(--stage-text-primary)] tracking-tight truncate flex-1">
          Edit item
        </h1>
      </header>

      <StagePanel className="rounded-[var(--stage-radius-panel)] overflow-hidden flex flex-col flex-1 min-h-0 max-h-[calc(100vh-10rem)]">
        <div
          className="overflow-y-auto overflow-x-hidden overscroll-contain flex-1 min-h-0 py-2"
          style={{ maxHeight: 'calc(100vh - 10rem)' }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-6 px-6 pb-6">
            {formError && (
              <p className="text-sm text-[var(--color-unusonic-error)]">{formError}</p>
            )}
            <div>
              <label htmlFor="edit-name" className={labelClass}>
                Name
              </label>
              <input
                id="edit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder={isBundle ? 'e.g. Gold Wedding Bundle' : 'e.g. One Hour of Photography'}
                required
              />
            </div>
            <div>
              <label htmlFor="edit-desc" className={labelClass}>
                Description (optional)
              </label>
              <textarea
                id="edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={cn(inputClass, 'resize-none')}
                placeholder="Included items or notes"
              />
            </div>
            <div>
              <label className={labelClass}>Image (optional)</label>
              <CatalogImageUpload
                packageId={id}
                workspaceId={workspaceId}
                currentImageUrl={imageUrl}
                onImageChange={setImageUrl}
              />
            </div>
            <div>
              <label htmlFor="edit-category" className={labelClass}>
                Category
              </label>
              <select
                id="edit-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as PackageCategory)}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-tags" className={labelClass}>
                Tags (optional)
              </label>
              <SmartTagInput
                id="edit-tags"
                workspaceId={workspaceId ?? null}
                value={selectedTags}
                onChange={(tags) =>
                  setSelectedTags(
                    tags.map((t) => ({
                      ...t,
                      workspace_id: t.workspace_id ?? workspaceId ?? '',
                    })),
                  )
                }
                getWorkspaceTags={getWorkspaceTags}
                createWorkspaceTag={createWorkspaceTag}
                placeholder="Type to search or create…"
              />
            </div>

            <PricingFields
              category={category}
              unitType={unitType}
              price={price}
              setPrice={setPrice}
              floorPrice={floorPrice}
              setFloorPrice={setFloorPrice}
              targetCost={targetCost}
              setTargetCost={setTargetCost}
              isSubRental={isSubRental}
            />

            {(category === 'service' || category === 'talent') && (
              <ServiceTalentSection
                category={category}
                durationHours={durationHours}
                setDurationHours={setDurationHours}
                staffRole={staffRole}
                setStaffRole={setStaffRole}
                jobTitles={jobTitles}
                requiredRole={requiredRole}
                setRequiredRole={setRequiredRole}
                performanceSetCount={performanceSetCount}
                setPerformanceSetCount={setPerformanceSetCount}
              />
            )}

            {category !== 'package' && (
              <BillingTypeSection
                unitType={unitType}
                setUnitType={setUnitType}
                unitMultiplier={unitMultiplier}
                setUnitMultiplier={setUnitMultiplier}
              />
            )}

            {category === 'rental' && (
              <RentalInventorySection
                stockQuantity={stockQuantity}
                setStockQuantity={setStockQuantity}
                isSubRental={isSubRental}
                setIsSubRental={setIsSubRental}
                replacementCost={replacementCost}
                setReplacementCost={setReplacementCost}
                bufferDays={bufferDays}
                setBufferDays={setBufferDays}
              />
            )}

            {category === 'rental' && (
              <RentalAlternativesSection
                alternatives={alternatives}
                setAlternatives={setAlternatives}
                allRentalPackages={allRentalPackages}
                altSearchOpen={altSearchOpen}
                setAltSearchOpen={setAltSearchOpen}
                altSearchQuery={altSearchQuery}
                setAltSearchQuery={setAltSearchQuery}
              />
            )}

            {category === 'retail_sale' && (
              <RetailSection
                stockQuantity={stockQuantity}
                setStockQuantity={setStockQuantity}
                bufferPercent={bufferPercent}
                setBufferPercent={setBufferPercent}
              />
            )}

            {isBundle && <BundleCTA id={id} />}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push('/catalog')}
                className="stage-hover overflow-hidden flex-1 px-4 py-3 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-3 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.22)] bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] font-medium text-sm hover:bg-[oklch(1_0_0_/_0.08)] disabled:opacity-45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>

          {/* Default crew section — outside the form so inputs don't trigger save */}
          {id && (
            <DefaultCrewSection
              assignees={assignees}
              inheritedAssignees={inheritedAssignees}
              crewMode={crewMode}
              setCrewMode={setCrewMode}
              crewSearch={crewSearch}
              crewResults={crewResults}
              crewSearchLoading={crewSearchLoading}
              crewPickerOpen={crewPickerOpen}
              setCrewPickerOpen={setCrewPickerOpen}
              onCrewSearch={handleCrewSearch}
              onAddAssignee={handleAddAssignee}
              onRemoveAssignee={handleRemoveAssignee}
              roleInput={roleInput}
              setRoleInput={setRoleInput}
              roleAdding={roleAdding}
              onAddRole={handleAddRole}
              jobTitles={jobTitles}
            />
          )}
        </div>
      </StagePanel>
    </div>
  );
}
