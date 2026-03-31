'use client';

import * as React from 'react';

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface UseModalLayerOptions {
  open: boolean;
  onClose: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Modal / sheet layer: body scroll lock (with scrollbar gutter), `inert` on the
 * app shell, Escape to dismiss, Tab focus trap, restore focus on close.
 * @see docs/reference/design/overlay-and-modal-system.md
 */
export function useModalLayer({ open, onClose, containerRef }: UseModalLayerOptions) {
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;

    const previousActive = document.activeElement as HTMLElement | null;
    let tabIndexTarget: HTMLElement | null = null;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const shell = document.body.firstElementChild as HTMLElement | null;
    if (shell) {
      shell.setAttribute('inert', '');
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = containerRef.current;
      if (!root) return;

      const nodes = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const focusables = Array.from(nodes).filter(
        (el) => el.getAttribute('aria-disabled') !== 'true'
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || (active && !root.contains(active))) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    const raf = requestAnimationFrame(() => {
      const root = containerRef.current;
      if (!root) return;
      const nodes = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const focusables = Array.from(nodes).filter((el) => el.getAttribute('aria-disabled') !== 'true');
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        if (!root.hasAttribute('tabindex')) {
          root.setAttribute('tabindex', '-1');
          tabIndexTarget = root;
        }
        root.focus();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      if (tabIndexTarget) {
        tabIndexTarget.removeAttribute('tabindex');
      }
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      shell?.removeAttribute('inert');
      if (previousActive && typeof previousActive.focus === 'function') {
        previousActive.focus();
      }
    };
  }, [open, containerRef]);
}
