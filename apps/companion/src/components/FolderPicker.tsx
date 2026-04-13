import { invoke } from '@tauri-apps/api/core';

interface FolderPickerProps {
  folders: string[];
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
}

export function FolderPicker({ folders, onAdd, onRemove }: FolderPickerProps) {
  const handleBrowse = async () => {
    try {
      const path = await invoke<string | null>('pick_music_folder');
      if (path) onAdd(path);
    } catch (e) {
      console.error('Folder picker failed:', e);
    }
  };

  return (
    <div className="stack-tight">
      {folders.length > 0 ? (
        folders.map((folder) => (
          <div key={folder} className="folder-row">
            <span className="text-sm text-secondary truncate flex-1">{folder}</span>
            <button
              className="btn-ghost text-xxs"
              onClick={() => onRemove(folder)}
              style={{ marginLeft: '8px' }}
            >
              Remove
            </button>
          </div>
        ))
      ) : (
        <span className="text-sm text-tertiary">
          No folders configured. Add your music library folder.
        </span>
      )}

      <button className="folder-add" onClick={handleBrowse}>
        + Add folder
      </button>
    </div>
  );
}
