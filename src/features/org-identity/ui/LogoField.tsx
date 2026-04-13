'use client';

import * as React from 'react';
import { Building2, Link2, Loader2, Upload } from 'lucide-react';
import { createClient } from '@/shared/api/supabase/client';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { colorWithAlpha } from '../lib/color';

const BUCKET = 'org-assets';
const ACCEPT = 'image/png,image/jpeg,image/webp';

export type LogoFieldMode = 'upload' | 'link';

export interface LogoFieldProps {
  value: string;
  onChange: (url: string) => void;
  mode?: LogoFieldMode;
  onModeChange?: (mode: LogoFieldMode) => void;
  brandColor?: string | null;
  className?: string;
  label?: string;
}

export function LogoField({
  value,
  onChange,
  mode: controlledMode,
  onModeChange,
  brandColor,
  className,
  label = 'Logo',
}: LogoFieldProps) {
  const [internalMode, setInternalMode] = React.useState<LogoFieldMode>('upload');
  const [uploading, setUploading] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState(value && value.startsWith('http') ? value : '');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const mode = controlledMode ?? internalMode;
  const setMode = React.useCallback(
    (m: LogoFieldMode) => {
      if (onModeChange) onModeChange(m);
      else setInternalMode(m);
    },
    [onModeChange]
  );

  // Sync linkUrl when value is set from outside (e.g. after upload)
  React.useEffect(() => {
    if (value && value.startsWith('http')) setLinkUrl(value);
  }, [value]);

  const handleFile = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setUploading(false);
          e.target.value = '';
          return;
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `genesis/${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
          upsert: true,
          contentType: file.type,
        });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        onChange(urlData.publicUrl);
      } catch {
        // Could toast error here
      }
      setUploading(false);
      e.target.value = '';
    },
    [onChange]
  );

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.trim();
    setLinkUrl(v);
    if (v && (v.startsWith('http://') || v.startsWith('https://'))) {
      onChange(v);
    } else if (!v) {
      onChange('');
    }
  };

  const handleLinkBlur = () => {
    if (linkUrl && (linkUrl.startsWith('http://') || linkUrl.startsWith('https://'))) {
      onChange(linkUrl);
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          {label}
        </span>
        <div className="flex rounded-xl border border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-surface)]/80 p-0.5">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              mode === 'upload'
                ? 'bg-[oklch(1_0_0_/_0.08)] text-[var(--stage-accent)]'
                : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
            )}
          >
            <Upload className="size-3.5" strokeWidth={1.5} />
            Upload
          </button>
          <button
            type="button"
            onClick={() => setMode('link')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              mode === 'link'
                ? 'bg-[oklch(1_0_0_/_0.08)] text-[var(--stage-accent)]'
                : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
            )}
          >
            <Link2 className="size-3.5" strokeWidth={1.5} />
            Link
          </button>
        </div>
      </div>

      {mode === 'upload' ? (
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              'relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border transition-colors disabled:opacity-45',
              'border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-surface)]/80 stage-hover overflow-hidden'
            )}
            style={
              brandColor
                ? { borderColor: colorWithAlpha(brandColor, 0.35) ?? undefined }
                : undefined
            }
          >
            {value ? (
              <img src={value} alt="" className="size-full object-cover" />
            ) : (
              <Building2 className="size-8 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--stage-void)]/90">
                <Loader2 className="size-6 animate-spin text-[var(--stage-accent)]" strokeWidth={1.5} />
              </div>
            )}
          </button>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-xs text-[var(--stage-text-secondary)]">
              PNG, JPEG or WebP. Click the tile to upload.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleFile}
            disabled={uploading}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            type="url"
            placeholder="https://…"
            value={linkUrl}
            onChange={handleLinkChange}
            onBlur={handleLinkBlur}
            className="border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-void)]/50 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]/60 text-sm"
          />
          <p className="text-label text-[var(--stage-text-secondary)]">
            Paste a public image URL.
          </p>
        </div>
      )}

      <input type="hidden" name="logo_url" value={value} readOnly aria-hidden />
    </div>
  );
}
