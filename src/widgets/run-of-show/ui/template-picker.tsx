'use client';

import { useEffect, useState } from 'react';
import { BookTemplate, Trash2, Download, Save } from 'lucide-react';

const SW = 1.5;
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import type { Cue, Section, RosTemplate } from '@/features/run-of-show/model/run-of-show-types';
import {
  fetchRosTemplates,
  saveRosTemplate,
  deleteRosTemplate,
  applyRosTemplate,
} from '@/app/(dashboard)/(features)/crm/actions/ros';

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  currentCues: Cue[];
  currentSections: Section[];
  onApplied: (cues: Cue[], sections: Section[]) => void;
}

export function TemplatePicker({
  open,
  onOpenChange,
  eventId,
  currentCues,
  currentSections,
  onApplied,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<RosTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchRosTemplates()
      .then(setTemplates)
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    if (!newName.trim()) { toast.error('Enter a template name'); return; }
    setSaving(true);
    try {
      const tpl = await saveRosTemplate(newName.trim(), null, currentCues, currentSections);
      setTemplates((prev) => [...prev, tpl].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      toast.success('Template saved');
    } catch {
      toast.error('Failed to save template');
    }
    setSaving(false);
  };

  const handleApply = async (templateId: string) => {
    if (currentCues.length > 0) {
      if (!window.confirm('This will add template cues to the existing timeline. Continue?')) return;
    }
    try {
      const { cues, sections } = await applyRosTemplate(eventId, templateId);
      onApplied(cues, sections);
      onOpenChange(false);
      toast.success('Template applied');
    } catch (err) {
      // Surface the real error so out-of-range section_ref / template-shape
      // failures aren't reduced to a generic "failed" message.
      toast.error(err instanceof Error ? err.message : 'Failed to apply template');
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await deleteRosTemplate(templateId);
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col p-0 w-full max-w-md">
        <SheetHeader>
          <SheetTitle>Templates</SheetTitle>
          <SheetClose />
        </SheetHeader>
        <SheetBody className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 p-4">
          {/* Save current as template */}
          <StagePanel className="flex flex-col gap-3" nested>
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
              Save current timeline
            </p>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Template name"
                className="flex-1 bg-[var(--ctx-well)] rounded-md px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !newName.trim()}
                className="stage-btn stage-btn-primary flex items-center gap-1.5 disabled:opacity-[0.45]"
              >
                <Save size={12} strokeWidth={SW} />
                Save
              </button>
            </div>
            <p className="text-label text-[var(--stage-text-secondary)]">
              {currentCues.length} cue{currentCues.length !== 1 ? 's' : ''}, {currentSections.length} section{currentSections.length !== 1 ? 's' : ''}
            </p>
          </StagePanel>

          {/* Template list */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
              Workspace templates
            </p>
            {loading ? (
              <div className="flex flex-col gap-2">
                <div className="h-16 stage-skeleton rounded-lg" />
                <div className="h-16 stage-skeleton rounded-lg" />
              </div>
            ) : templates.length === 0 ? (
              <p className="text-xs text-[var(--stage-text-secondary)] py-4 text-center">No templates yet</p>
            ) : (
              templates.map((tpl) => {
                const cueCount = tpl.cues?.length ?? 0;
                const sectionCount = tpl.sections?.length ?? 0;
                return (
                  <StagePanel key={tpl.id} nested className="flex items-center gap-3">
                    <BookTemplate size={16} strokeWidth={SW} className="text-[var(--stage-text-secondary)] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">{tpl.name}</p>
                      <p className="text-label text-[var(--stage-text-secondary)]">
                        {cueCount} cue{cueCount !== 1 ? 's' : ''}
                        {sectionCount > 0 && ` · ${sectionCount} section${sectionCount !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApply(tpl.id)}
                      className="stage-btn stage-btn-secondary flex items-center gap-1"
                    >
                      <Download size={10} strokeWidth={SW} />
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tpl.id)}
                      className="p-1.5 rounded-md text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10 transition-colors"
                    >
                      <Trash2 size={12} strokeWidth={SW} />
                    </button>
                  </StagePanel>
                );
              })
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
