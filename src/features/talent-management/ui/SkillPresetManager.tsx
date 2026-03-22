'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { WorkspaceSkillPreset } from '@/entities/talent/api/get-workspace-skill-presets';
import { getWorkspaceSkillPresets } from '@/entities/talent/api/get-workspace-skill-presets';
import { addWorkspaceSkillPreset, removeWorkspaceSkillPreset } from '../api/skill-preset-actions';

interface SkillPresetManagerProps {
  workspaceId: string;
  initialPresets: WorkspaceSkillPreset[];
}

export function SkillPresetManager({ workspaceId, initialPresets }: SkillPresetManagerProps) {
  const [presets, setPresets] = React.useState<WorkspaceSkillPreset[]>(initialPresets);
  const [newTag, setNewTag] = React.useState('');
  const [adding, setAdding] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const updated = await getWorkspaceSkillPresets(workspaceId);
    setPresets(updated);
  }, [workspaceId]);

  const handleAdd = async () => {
    const tag = newTag.trim();
    if (!tag) return;
    setAdding(true);
    const result = await addWorkspaceSkillPreset({ workspace_id: workspaceId, skill_tag: tag });
    setAdding(false);
    if (result.ok) {
      toast.success(`"${tag}" added to skill presets.`);
      setNewTag('');
      await refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemove = async (preset: WorkspaceSkillPreset) => {
    const result = await removeWorkspaceSkillPreset({
      preset_id: preset.id,
      workspace_id: workspaceId,
    });
    if (result.ok) {
      toast.success(`"${preset.skill_tag}" removed.`);
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
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
        <p className="text-sm text-ink-muted leading-relaxed">
          These tags appear as quick-picks when adding skills to a roster member. Any member can still type a custom skill — these are curated suggestions only.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. FOH Engineer"
          className="bg-transparent border-[var(--color-mercury)] text-[var(--color-ink)]"
          maxLength={120}
        />
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={!newTag.trim() || adding}
          className="shrink-0"
        >
          <Plus className="size-4 mr-1.5" />
          Add
        </Button>
      </div>

      {presets.length === 0 ? (
        <p className="text-sm text-ink-muted">No skill presets configured.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="flex items-center justify-between rounded-lg border border-[var(--color-mercury)]/50 bg-[var(--color-obsidian)]/30 px-3 py-2.5"
            >
              <span className="text-sm text-[var(--color-ink)]">{preset.skill_tag}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => handleRemove(preset)}
                className="text-[var(--color-ink-muted)] hover:text-[var(--color-unusonic-error)]"
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
