'use client';

import * as React from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/shared/api/supabase/client';
import { cn } from '@/shared/lib/utils';

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = 'org-assets';

export interface CatalogImageUploadProps {
  packageId: string;
  workspaceId: string;
  currentImageUrl: string | null;
  onImageChange: (url: string | null) => void;
  className?: string;
}

export function CatalogImageUpload({
  packageId,
  workspaceId,
  currentImageUrl,
  onImageChange,
  className,
}: CatalogImageUploadProps) {
  const [uploading, setUploading] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Clean up object URL on unmount or when preview changes
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = React.useCallback(
    async (file: File) => {
      setError(null);

      // Validate type
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setError('Only PNG, JPEG, and WebP images are supported.');
        return;
      }

      // Validate size
      if (file.size > MAX_SIZE_BYTES) {
        setError('Image must be under 5 MB.');
        return;
      }

      // Show preview immediately
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setUploading(true);

      try {
        const supabase = createClient();
        const ext = file.name.split('.').pop() ?? 'jpg';
        const path = `${workspaceId}/catalog/${packageId}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(BUCKET).getPublicUrl(path);

        // Clear preview (real URL will be used now)
        URL.revokeObjectURL(objectUrl);
        setPreviewUrl(null);
        onImageChange(publicUrl);
      } catch (err) {
        console.error('[CatalogImageUpload] Upload failed:', err);
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setError(msg);
        toast.error(msg);
        // Revert preview
        URL.revokeObjectURL(objectUrl);
        setPreviewUrl(null);
      } finally {
        setUploading(false);
      }
    },
    [packageId, workspaceId, onImageChange],
  );

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleRemove = React.useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setError(null);
    onImageChange(null);
  }, [previewUrl, onImageChange]);

  const displayUrl = previewUrl ?? currentImageUrl;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {displayUrl ? (
        /* ---- Image thumbnail with remove button ---- */
        <div className="relative group aspect-video w-full max-w-[240px] rounded-[var(--stage-radius-input)] overflow-hidden bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.08)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt="Catalog item"
            className="w-full h-full object-cover"
          />

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[oklch(0_0_0_/_0.5)]">
              <Loader2 className="size-5 text-[var(--stage-text-primary)] animate-spin" />
            </div>
          )}

          {!uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[oklch(0_0_0_/_0.6)] text-[var(--stage-text-primary)] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[oklch(0_0_0_/_0.8)] transition-opacity"
              aria-label="Remove image"
            >
              <X className="size-3.5" />
            </button>
          )}

          {/* Click existing image to replace */}
          {!uploading && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center bg-[oklch(0_0_0_/_0.3)] transition-opacity cursor-pointer"
              aria-label="Replace image"
            >
              <span className="text-xs font-medium text-[var(--stage-text-primary)]">Replace</span>
            </button>
          )}
        </div>
      ) : (
        /* ---- Drop zone ---- */
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          disabled={uploading}
          className={cn(
            'relative w-full max-w-[240px] aspect-video rounded-[var(--stage-radius-input)] border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer',
            isDragOver
              ? 'border-[var(--stage-accent)] bg-[var(--stage-surface-elevated)]'
              : 'border-[oklch(1_0_0_/_0.12)] hover:border-[oklch(1_0_0_/_0.2)] bg-[var(--ctx-well)]',
            uploading && 'opacity-60 pointer-events-none',
          )}
        >
          {uploading ? (
            <Loader2 className="size-5 text-[var(--stage-text-secondary)] animate-spin" />
          ) : (
            <>
              <ImagePlus className="size-5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
              <span className="stage-label text-[var(--stage-text-secondary)]">
                Drop image or click
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleInputChange}
        disabled={uploading}
      />

      {error && (
        <p className="text-xs text-[var(--color-unusonic-error)]">{error}</p>
      )}
    </div>
  );
}
