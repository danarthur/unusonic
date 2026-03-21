'use client';

import * as React from 'react';
import { User, Camera, Check, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import { createClient } from '@/shared/api/supabase/client';
import { updateProfile } from '../api/actions';
import { Button } from '@/shared/ui/button';

const BUCKET = 'avatars';
const ACCEPT = 'image/png,image/jpeg,image/webp';
const CROP_SIZE = 240;
const OUTPUT_SIZE = 256;

export interface ProfileAvatarUploadProps {
  value?: string | null;
  onChange: (url: string) => void;
  onUploadComplete?: () => void;
  className?: string;
}

/**
 * Profile avatar upload: pick file → adjust position & zoom in circle → upload cropped result.
 * Same UX as add-employee AvatarUpload; uploads from client (avoids Server Action body limits).
 */
export function ProfileAvatarUpload({
  value,
  onChange,
  onUploadComplete,
  className,
}: ProfileAvatarUploadProps) {
  const [uploading, setUploading] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0, scale: 1 });
  const [imageSize, setImageSize] = React.useState({ w: 0, h: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStart = React.useRef({ x: 0, y: 0, cropX: 0, cropY: 0 });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  const clearPending = React.useCallback(() => {
    setPendingFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCrop({ x: 0, y: 0, scale: 1 });
  }, [previewUrl]);

  const handleFileSelect = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setPendingFile(file);
      setCrop({ x: 0, y: 0, scale: 1 });
    },
    []
  );

  const onImageLoad = React.useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setImageSize({ w, h });
  }, []);

  const handleCropConfirm = React.useCallback(async () => {
    const img = imgRef.current;
    const file = pendingFile;
    if (!img || !file || !img.complete || imageSize.w === 0) return;
    const base = CROP_SIZE / Math.min(imageSize.w, imageSize.h);

    setUploading(true);
    try {
      const blob = await cropImageToRoundedSquare(
        img,
        imageSize.w,
        imageSize.h,
        crop,
        base,
        OUTPUT_SIZE
      );

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Not authenticated');
        return;
      }

      const path = `avatars/${user.id}-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, {
          upsert: true,
          contentType: 'image/png',
        });

      if (uploadError) {
        console.error('[ProfileAvatarUpload] Storage error:', uploadError);
        toast.error(uploadError.message || 'Failed to upload avatar');
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const result = await updateProfile({ avatarUrl: publicUrl });
      if (!result.success) {
        toast.error(result.error || 'Failed to update profile');
        return;
      }

      onChange(publicUrl);
      clearPending();
      onUploadComplete?.();
    } catch (err) {
      console.error('[ProfileAvatarUpload] Error:', err);
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }, [
    pendingFile,
    onChange,
    onUploadComplete,
    crop,
    imageSize.w,
    imageSize.h,
    clearPending,
  ]);

  const handleCropCancel = React.useCallback(() => {
    clearPending();
  }, [clearPending]);

  const handleCropPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      if (!pendingFile) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, cropX: crop.x, cropY: crop.y };
    },
    [pendingFile, crop.x, crop.y]
  );

  React.useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      setCrop((prev) => ({
        ...prev,
        x: dragStart.current.cropX + (e.clientX - dragStart.current.x),
        y: dragStart.current.cropY + (e.clientY - dragStart.current.y),
      }));
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isDragging]);

  const canEditCrop =
    pendingFile && imageSize.w >= CROP_SIZE / 2 && imageSize.h >= CROP_SIZE / 2;
  const baseScale =
    imageSize.w && imageSize.h ? CROP_SIZE / Math.min(imageSize.w, imageSize.h) : 1;
  const displayScale = baseScale * crop.scale;

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      {pendingFile && previewUrl ? (
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative rounded-xl overflow-hidden border-2 border-[var(--glass-border)] bg-ink/[0.02] select-none"
            style={{ width: CROP_SIZE, height: CROP_SIZE }}
          >
            <div
              className="absolute inset-0 flex items-center justify-center cursor-move touch-none rounded-xl overflow-hidden"
              onPointerDown={handleCropPointerDown}
            >
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Crop preview"
                className="max-w-none pointer-events-none"
                style={{
                  width: imageSize.w ? imageSize.w * displayScale : 'auto',
                  height: imageSize.h ? imageSize.h * displayScale : 'auto',
                  transform: `translate(${crop.x}px, ${crop.y}px)`,
                }}
                onLoad={onImageLoad}
                draggable={false}
              />
            </div>
          </div>
          {canEditCrop && (
            <>
              <p className="text-xs text-ink-muted">Drag to reposition</p>
              <div className="flex items-center gap-3 w-full max-w-[200px]">
                <span className="text-xs text-ink-muted shrink-0">Zoom</span>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.05}
                  value={crop.scale}
                  onChange={(e) => setCrop((p) => ({ ...p, scale: Number(e.target.value) }))}
                  className="flex-1 h-2 rounded-full appearance-none bg-white/10 accent-[var(--color-silk)]"
                />
              </div>
            </>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCropCancel}
              className="gap-1"
            >
              <X className="size-4" />
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCropConfirm}
              disabled={uploading}
              className="gap-1 bg-[var(--color-silk)]/90 text-[var(--color-canvas)] hover:bg-[var(--color-silk)]"
            >
              {uploading ? 'Uploading…' : (
                <>
                  <Check className="size-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative group">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className={cn(
                'relative w-24 h-24 flex items-center justify-center overflow-hidden transition-colors cursor-pointer group',
                value
                  ? 'avatar-primary hover:shadow-[0_0_20px_oklch(0.70_0.15_250/0.2)]'
                  : 'rounded-xl border-2 border-dashed border-[var(--glass-border)] hover:border-walnut/40 hover:bg-ink/[0.03]',
                uploading && 'opacity-60 pointer-events-none'
              )}
            >
              {value ? (
                <>
                  <img src={value} alt="Avatar" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-ink/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                    <Camera className="w-6 h-6 text-canvas" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <User className="w-8 h-8 text-ink-muted/50 group-hover:text-[var(--color-silk)]/50 transition-colors" />
                  <span className="text-[9px] text-ink-muted/50 uppercase tracking-wider">
                    Avatar
                  </span>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-ink/50">
                  <span className="text-xs text-canvas">Uploading…</span>
                </div>
              )}
            </button>
            {value && (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const result = await updateProfile({ avatarUrl: null });
                  if (result.success) {
                    onChange('');
                    onUploadComplete?.();
                  } else {
                    toast.error(result.error || 'Failed to remove avatar');
                  }
                }}
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleFileSelect}
            disabled={uploading}
          />
          <span className="text-xs text-ink-muted">Upload photo</span>
        </>
      )}
    </div>
  );
}

/** Crop to square (rounded rect when displayed in rounded-xl container). Primary avatar shape. */
async function cropImageToRoundedSquare(
  img: HTMLImageElement,
  imgW: number,
  imgH: number,
  crop: { x: number; y: number; scale: number },
  baseScale: number,
  outSize: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');

  const totalScale = baseScale * crop.scale;
  const half = CROP_SIZE / 2;
  const side = CROP_SIZE / totalScale;
  const cx = imgW / 2 - crop.x / totalScale - half / totalScale;
  const cy = imgH / 2 - crop.y / totalScale - half / totalScale;
  const sx = Math.max(0, Math.min(cx, imgW - side));
  const sy = Math.max(0, Math.min(cy, imgH - side));
  const sw = Math.min(side, imgW - sx);
  const sh = Math.min(side, imgH - sy);

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outSize, outSize);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
      0.92
    );
  });
}
