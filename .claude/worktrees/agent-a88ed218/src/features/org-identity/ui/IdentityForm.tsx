'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { createClient } from '@/shared/api/supabase/client';
import { updateOrg } from '@/features/org-management/api';
import { updateOrgIdentity, type UpdateOrgIdentityResult } from '../api/actions';
import { ColorTuner } from './ColorTuner';
import { Textarea } from '@/shared/ui/textarea';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { cn } from '@/shared/lib/utils';
import type { OrgDetails } from '@/entities/organization';
import { colorWithAlpha } from '../lib/color';
import { toast } from 'sonner';

const BUCKET = 'org-assets';
const ACCEPT = 'image/png,image/jpeg,image/webp';

export interface IdentityFormProps {
  orgId: string;
  defaultValues: Pick<OrgDetails, 'name' | 'slug' | 'description' | 'brand_color' | 'logo_url'>;
  onValuesChange?: (values: {
    name: string;
    slug: string;
    description: string | null;
    brand_color: string | null;
    logo_url: string | null;
  }) => void;
  /** Submit button label (e.g. "Initialize System" vs "Save changes" when re-editing). */
  submitLabel?: string;
  className?: string;
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    || 'organization';
}

export function IdentityForm({ orgId, defaultValues, onValuesChange, submitLabel = 'Initialize System', className }: IdentityFormProps) {
  const [name, setName] = React.useState(defaultValues.name || '');
  const [description, setDescription] = React.useState(defaultValues.description ?? '');
  const [brandColor, setBrandColor] = React.useState<string | null>(defaultValues.brand_color ?? null);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(defaultValues.logo_url ?? null);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const slug = React.useMemo(() => slugFromName(name), [name]);

  const syncToMirror = React.useCallback(() => {
    onValuesChange?.({
      name,
      slug,
      description: description.trim() || null,
      brand_color: brandColor,
      logo_url: logoUrl,
    });
  }, [name, slug, description, brandColor, logoUrl, onValuesChange]);

  React.useEffect(() => syncToMirror(), [syncToMirror]);

  const [state, submitAction, isPending] = useActionState(updateOrgIdentity, null as UpdateOrgIdentityResult | null);

  const handleLogoFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const supabase = createClient();
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `logos/${orgId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
          upsert: true,
          contentType: file.type,
        });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = urlData.publicUrl;
        const result = await updateOrg({ org_id: orgId, logo_url: publicUrl });
        if (!result.ok) throw new Error(result.error);
        setLogoUrl(publicUrl);
        onValuesChange?.({
          name,
          slug: slugFromName(name),
          description: description.trim() || null,
          brand_color: brandColor,
          logo_url: publicUrl,
        });
      } catch {
        setUploading(false);
        e.target.value = '';
        return;
      }
      setUploading(false);
      e.target.value = '';
    },
    [orgId, name, description, brandColor, onValuesChange]
  );

  React.useEffect(() => {
    if (state?.ok === false) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={submitAction}
      onSubmit={() => document.dispatchEvent(new CustomEvent('signal:identity-saving'))}
      className={cn('space-y-8', className)}
    >
      {/* Logo: circular dropzone, same border as Mirror card (border + mercury or accent) */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-[var(--color-ink-muted)]">Logo</label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white/5 transition-colors hover:bg-white/10 disabled:opacity-50',
            !brandColor && 'border-[var(--color-mercury)]'
          )}
          style={brandColor ? { borderColor: colorWithAlpha(brandColor, 0.25) ?? brandColor } : undefined}
        >
          {logoUrl ? (
            <>
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(248,250,252,0.7) 0%, rgba(226,232,240,0.4) 50%, transparent 100%)',
                }}
                aria-hidden
              />
              <img
                src={logoUrl}
                alt=""
                className="relative z-10 size-full object-contain p-2"
              />
            </>
          ) : (
            <Building2 className="size-10 text-[var(--color-ink-muted)]" />
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <span className="text-xs text-white">Uploading…</span>
            </div>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={handleLogoFile}
          disabled={uploading}
        />
        <p className="text-xs text-[var(--color-ink-muted)]">Click to upload. PNG, JPEG, WebP.</p>
      </div>

      {/* Brand Color – Chromatic Tuner (precision HEX + Oklch readout) */}
      <input type="hidden" name="brand_color" value={brandColor ?? ''} />
      <input type="hidden" name="logo_url" value={logoUrl ?? ''} />
      <ColorTuner value={brandColor} onChange={setBrandColor} />

      {/* Name (auto-slug) */}
      <div className="space-y-2">
        <FloatingLabelInput
          label="Organization name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-white/5 border-[var(--color-mercury)]"
        />
        {name.trim() && (
          <p className="text-xs text-[var(--color-ink-muted)]">
            Slug: <span className="font-mono text-[var(--color-ink-muted)]">{slug}</span>
          </p>
        )}
      </div>

      {/* Public Bio (auto-resizing via field-sizing: content) */}
      <div className="space-y-2">
        <label htmlFor="identity-bio" className="text-sm font-medium text-[var(--color-ink-muted)]">
          Public bio
        </label>
        <Textarea
          id="identity-bio"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="How you appear to partners and clients."
          rows={4}
          className="min-h-24 w-full resize-y bg-white/5 border-[var(--color-mercury)] placeholder:text-[var(--color-ink-muted)]/50"
        />
      </div>

      {state?.ok === false && (
        <p className="text-sm text-[var(--color-signal-error)]">{state.error}</p>
      )}

      <div className="pt-8">
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            'relative w-full overflow-hidden rounded-xl border border-[var(--color-mercury)] bg-white/10 px-6 py-4 text-sm font-medium text-[var(--color-ink)] transition-colors hover:bg-white/15 hover:border-white/20 disabled:opacity-50'
          )}
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Forging Identity…
            </span>
          ) : (
            submitLabel
          )}
          {isPending && (
            <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
          )}
        </button>
      </div>
    </form>
  );
}
