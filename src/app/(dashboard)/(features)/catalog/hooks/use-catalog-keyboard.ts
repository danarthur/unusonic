'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { PackageWithTags } from '@/features/sales/api/package-actions';

interface UseCatalogKeyboardOptions {
  packages: PackageWithTags[];
  onOpenCreate: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  viewMode: 'grid' | 'table' | 'timeline';
}

/** Grid columns used for arrow key navigation in grid view. */
const GRID_COLS = 3;

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function useCatalogKeyboard({
  packages,
  onOpenCreate,
  searchInputRef,
  viewMode,
}: UseCatalogKeyboardOptions) {
  const router = useRouter();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // "/" focuses search
      if (e.key === '/' && !isInputFocused()) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // "c" opens create modal
      if (e.key === 'c' && !isInputFocused()) {
        e.preventDefault();
        onOpenCreate();
        return;
      }

      // Escape blurs search and clears focus
      if (e.key === 'Escape') {
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
        setFocusedIndex(null);
        return;
      }

      // Arrow keys — only when not in an input
      if (isInputFocused()) return;

      const count = packages.length;
      if (count === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev === null) return 0;
          if (viewMode === 'grid') {
            const next = prev + GRID_COLS;
            return next < count ? next : prev;
          }
          return Math.min(prev + 1, count - 1);
        });
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev === null) return 0;
          if (viewMode === 'grid') {
            const next = prev - GRID_COLS;
            return next >= 0 ? next : prev;
          }
          return Math.max(prev - 1, 0);
        });
        return;
      }

      if (e.key === 'ArrowRight' && viewMode === 'grid') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, count - 1);
        });
        return;
      }

      if (e.key === 'ArrowLeft' && viewMode === 'grid') {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev === null) return 0;
          return Math.max(prev - 1, 0);
        });
        return;
      }

      // Enter navigates to focused item
      if (e.key === 'Enter' && focusedIndex !== null && focusedIndex < count) {
        e.preventDefault();
        const pkg = packages[focusedIndex];
        const href =
          pkg.category === 'package'
            ? `/catalog/${pkg.id}/builder`
            : `/catalog/${pkg.id}/edit`;
        router.push(href);
      }
    },
    [packages, onOpenCreate, searchInputRef, viewMode, focusedIndex, router]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Reset focused index when packages change (filter/search)
  useEffect(() => {
    setFocusedIndex(null);
  }, [packages]);

  return { focusedIndex, setFocusedIndex };
}
