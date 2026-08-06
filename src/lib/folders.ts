// Folder management — pure helpers, no React.
// Folders are rows with `parent_id` (Drive-style), not storage path prefixes.
// See supabase/folder_management.sql for the schema these mirror.

export type FolderVisibility = 'committee' | 'everyone';

export type DocType = 'invoice' | 'contract' | 'receipt' | 'template' | 'reference' | 'other';

export interface Folder {
  id: string;
  committeeId: string;
  parentId: string | null;
  name: string;
  visibility: FolderVisibility;
  createdBy: string | null;
  createdAt: string;
}

export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'contract', label: 'Contract' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'template', label: 'Template' },
  { value: 'reference', label: 'Reference' },
  { value: 'other', label: 'Other' },
];

// Walks up the tree via `parentId` and returns root-first (breadcrumb order).
// Capped at 20 hops so a malformed cycle (which the DB trigger should prevent,
// but this runs in a render path and must never risk an infinite loop) simply
// stops early and returns whatever it managed to collect.
export function buildBreadcrumbs(folders: Folder[], folderId: string | null): Folder[] {
  const trail: Folder[] = [];
  let currentId = folderId;
  let hops = 0;
  while (currentId && hops < 20) {
    const folder = folders.find(f => f.id === currentId);
    if (!folder) break;
    trail.push(folder);
    currentId = folder.parentId;
    hops++;
  }
  return trail.reverse();
}

// Direct children of a folder (or the root, when parentId is null), sorted
// alphabetically by name.
export function childrenOf(folders: Folder[], parentId: string | null): Folder[] {
  return folders
    .filter(f => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}
