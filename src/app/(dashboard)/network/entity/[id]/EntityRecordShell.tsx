'use client';

/**
 * The one shell every entity record page renders inside.
 *
 * There used to be five pages. `EntityStudioClient` dispatches to a component
 * per subtype -- employee, freelancer, individual, couple, company -- and each
 * one had hand-rolled its own header, its own save affordance and its own idea
 * of which records a record has. They had drifted:
 *
 *   - the ledger, the productions list and the documents appeared on a
 *     company's page and were simply absent from a freelancer's, because
 *     `EntityRecordsAside` had been added to one of the five files;
 *   - upcoming assignments -- the thing you most want on a person you book --
 *     rendered only for companies;
 *   - the freelancer's Save sat at the bottom of the page and was always on,
 *     while everyone else's appeared in the header once the form was dirty;
 *   - an individual's page rendered the productions list twice, once as the
 *     overview summary and once in full underneath it.
 *
 * None of that was decided. It is what five copies of a layout do over time.
 *
 * So the shell is invariant and the body is the only thing that varies, which
 * is the one published pattern for this (Power Apps model-driven forms: one
 * form per table, a designated fallback, and variation confined to the body --
 * header, command bar and tab strip held constant across every variant).
 *
 * The records live in the rail, not the body. That is HubSpot's and Attio's
 * split rather than Polaris's -- on a contact record the relationships are what
 * you came for, so the wide column is for what you edit and what you know, and
 * the narrow one carries assignments, productions, money and documents.
 *
 * Design: docs/entity-panel-and-page-ia.md §P1.
 *
 * @module app/network/entity/EntityRecordShell
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { EntityAvatar } from '@/entities/network/ui/EntityAvatar';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { useUnsavedChanges } from '@/shared/lib/use-unsaved-changes';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/shared/ui/dialog';
import { EntityRecordsAside } from './EntityRecordsAside';

export interface EntityRecordShellProps {
  /** The directory entity this page is about. Null on records with no entity row yet. */
  entityId: string | null;
  entityType: 'person' | 'company' | 'venue' | null;
  workspaceId: string | null;
  /** What the header says, and what the avatar is drawn from. */
  name: string;
  /** The eyebrow above the name: "Roster member", "Preferred freelancer", … */
  eyebrow: string;
  avatarUrl?: string | null;
  /** Couples get their own avatar treatment, so this is wider than entityType. */
  avatarType?: 'person' | 'company' | 'venue' | 'couple';
  returnPath: string;
  /**
   * The save bar appears only once there is something to save. Omit `onSave`
   * for a read-only record -- the direct-entity view has no form to commit.
   */
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  /** Actions that belong beside the save bar rather than in the body. */
  headerActions?: React.ReactNode;
  /** Full-width, above the columns. The employee invite prompt is the one user. */
  banner?: React.ReactNode;
  children: React.ReactNode;
}

export function EntityRecordShell({
  entityId,
  entityType,
  workspaceId,
  name,
  eyebrow,
  avatarUrl,
  avatarType,
  returnPath,
  dirty = false,
  saving = false,
  onSave,
  headerActions,
  banner,
  children,
}: EntityRecordShellProps) {
  const router = useRouter();
  const navigate = React.useCallback((href: string) => router.push(href), [router]);
  /*
    The save bar tells you there is something unsaved; this is what stops you
    walking away from it. On the App Router a `beforeunload` handler alone
    looks like a guard and catches nothing -- client-side routing never fires
    it -- so every in-app link needs intercepting too.

    Accordion toggles are deliberately invisible to this. Warning on
    progressive disclosure is the fastest way to teach someone to dismiss the
    dialog without reading it.
  */
  const { pendingHref, cancel, confirm, guard } = useUnsavedChanges(dirty, navigate);

  return (
    <div className="min-h-screen bg-[var(--stage-void)] pb-32">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--stage-edge-subtle)] bg-[var(--stage-void)] px-6 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (guard(returnPath)) router.push(returnPath);
            }}
            aria-label="Back"
          >
            <ArrowLeft className="size-5" strokeWidth={1.5} />
          </Button>
          {/*
            Identity, rendered the way it is on the card and in the panel. It is
            the one thing meant to repeat across the three surfaces -- seeing
            the same mark is how you know a click kept you on the same person.
          */}
          <div className="flex min-w-0 items-center gap-3">
            <EntityAvatar name={name} avatarUrl={avatarUrl ?? null} entityType={avatarType} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-medium tracking-tight text-[var(--stage-text-primary)]">
                {name || 'Untitled'}
              </h1>
              <p className="truncate stage-label">{eyebrow}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {headerActions}
          <AnimatePresence>
            {dirty && onSave && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={STAGE_MEDIUM}
                className="flex items-center gap-3"
              >
                <span className="hidden text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] sm:block">
                  Unsaved changes
                </span>
                <Button onClick={onSave} disabled={saving} className="gap-2 stage-btn stage-btn-primary">
                  <Save className="size-4" strokeWidth={1.5} />
                  Save
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {banner && <div className="mx-auto max-w-6xl px-6 pt-6">{banner}</div>}

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/*
          Two columns, because width is the whole reason this page exists
          alongside the panel. A drawer stacks; a page juxtaposes -- you change
          a fact on the left while the history that justifies it stays in view
          on the right. One column below lg, where the page has no width
          advantage to offer and the panel is already full-screen anyway.
        */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0 space-y-3">{children}</div>
          <EntityRecordsAside
            entityId={entityId}
            entityType={entityType}
            workspaceId={workspaceId}
          />
        </div>
      </div>

      <Dialog open={pendingHref !== null} onOpenChange={(open) => { if (!open) cancel(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <p className="px-6 pb-6 text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
            This record has changes that have not been saved. Leaving now discards them.
          </p>
          <div className="flex gap-3 px-6 pb-6">
            <Button variant="outline" size="sm" onClick={cancel} className="flex-1">
              Stay
            </Button>
            <Button
              size="sm"
              onClick={confirm}
              className="flex-1 border-[var(--color-unusonic-error)]/50 text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10"
            >
              Discard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
