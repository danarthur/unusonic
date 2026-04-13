'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { WorkspaceJobTitle } from '@/entities/talent/api/get-workspace-job-titles';
import { getWorkspaceJobTitles } from '@/entities/talent/api/get-workspace-job-titles';
import { addWorkspaceJobTitle, removeWorkspaceJobTitle } from '../api/job-title-actions';

interface JobTitleManagerProps {
  workspaceId: string;
  initialTitles: WorkspaceJobTitle[];
}

export function JobTitleManager({ workspaceId, initialTitles }: JobTitleManagerProps) {
  const [titles, setTitles] = React.useState<WorkspaceJobTitle[]>(initialTitles);
  const [newTitle, setNewTitle] = React.useState('');
  const [adding, setAdding] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const updated = await getWorkspaceJobTitles(workspaceId);
    setTitles(updated);
  }, [workspaceId]);

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    const result = await addWorkspaceJobTitle({ workspace_id: workspaceId, title });
    setAdding(false);
    if (result.ok) {
      toast.success(`"${title}" added to job titles.`);
      setNewTitle('');
      await refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemove = async (jt: WorkspaceJobTitle) => {
    const result = await removeWorkspaceJobTitle({
      job_title_id: jt.id,
      workspace_id: workspaceId,
    });
    if (result.ok) {
      toast.success(`"${jt.title}" removed.`);
      setTitles((prev) => prev.filter((t) => t.id !== jt.id));
    } else {
      toast.error(result.error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">
          Standardized titles for your roster — "DJ", "Stage Manager", etc. Members select one of these when setting their job title, enabling exact crew filtering during assignment.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Monitor Engineer"
          className="border-[var(--stage-border)] text-[var(--stage-text-primary)]"
          maxLength={120}
        />
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={!newTitle.trim() || adding}
          className="shrink-0"
        >
          <Plus className="size-4 mr-1.5" />
          Add
        </Button>
      </div>

      {titles.length === 0 ? (
        <p className="text-sm text-[var(--stage-text-secondary)]">No job titles configured.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {titles.map((jt) => (
            <li
              key={jt.id}
              className="flex items-center justify-between rounded-[var(--stage-radius-nested)] border border-[var(--stage-border)]/50 bg-[var(--ctx-well)] px-3 py-2.5"
            >
              <span className="text-sm text-[var(--stage-text-primary)]">{jt.title}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => handleRemove(jt)}
                className="text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)]"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
