'use client';

import * as React from 'react';
import { Upload, Building2 } from 'lucide-react';
import { createClient } from '@/shared/api/supabase/client';
import { updateOrg } from '../api/update-org';
import { cn } from '@/shared/lib/utils';

const BUCKET = 'org-assets';
const ACCEPT = 'image/png,image/jpeg,image/webp';

interface OrgLogoUploadProps {
  orgId: string;
  logoUrl: string | null;
  onSuccess?: (logoUrl: string) => void;
  onError?: (error: string) => void;
  className?: string;
}

/** Upload logo to org-assets/logos/{org_id}/{timestamp}.png and update org record. */
export function OrgLogoUpload({ orgId, logoUrl, onSuccess, onError, className }: OrgLogoUploadProps) {
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = React.useCallback(
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
        onSuccess?.(publicUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.';
        onError?.(message);
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    },
    [orgId, onSuccess, onError]
  );

  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
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
              alt="Logo"
              className="relative z-10 size-full object-contain p-2"
            />
          </>
        ) : (
          <Building2 className="size-10 text-[var(--color-ink-muted)]" />
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <span className="text-xs text-white">Uploading…</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFile}
        disabled={uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[var(--color-ink)] transition-colors hover:bg-white/10 disabled:opacity-50"
      >
        <Upload className="size-4" />
        {logoUrl ? 'Replace logo' : 'Upload logo'}
      </button>
    </div>
  );
}
