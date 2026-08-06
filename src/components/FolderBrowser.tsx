'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Folder as FolderIcon,
  FolderPlus,
  File as FileIcon,
  Upload,
  Download,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronRight,
  Loader2,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { buildBreadcrumbs, childrenOf, DOC_TYPES, type Folder, type FolderVisibility, type DocType } from '@/lib/folders';

type BrowserFile = {
  id: string;
  fileName: string;
  fileSizeBytes: number | null;
  storagePath: string;
  uploadedByName: string;
  createdAt: string;
  folderId: string | null;
  docType: DocType | null;
  vendorId: string | null;
};

// Just enough to populate the "link to vendor" dropdown — the vendors table
// itself is owned by src/lib/vendors.ts / src/app/vendors/page.tsx.
type VendorOption = { id: string; name: string };

interface FolderBrowserProps {
  committeeId: string;
  // create/rename/delete folders, move files.
  canManage: boolean;
  // upload files into the folder currently being viewed.
  canUpload: boolean;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const docTypeLabel = (docType: DocType | null) => DOC_TYPES.find(d => d.value === docType)?.label ?? null;

export default function FolderBrowser({ committeeId, canManage, canUpload }: FolderBrowserProps) {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useAuth();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<BrowserFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Vendors for the "link to vendor" dropdown — id + name only, loaded once on
  // mount (the directory itself is small and rarely changes mid-session).
  const [vendors, setVendors] = useState<VendorOption[]>([]);

  // New-folder inline form (matches the existing add-task pattern — no modal).
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderVisibility, setNewFolderVisibility] = useState<FolderVisibility>('committee');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Per-row rename: pencil -> editable -> Save/Cancel, nothing writes until Save.
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [draftFolderName, setDraftFolderName] = useState('');
  const [draftFolderVisibility, setDraftFolderVisibility] = useState<FolderVisibility>('committee');
  const [isSavingFolder, setIsSavingFolder] = useState(false);

  // Upload: files are staged (via the input or a drop) before the actual
  // upload, so the doc-type dropdown can be set once for the batch.
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [uploadDocType, setUploadDocType] = useState<DocType | ''>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!committeeId) return;
    setIsLoading(true);

    const [{ data: folderRows }, { data: fileRows }] = await Promise.all([
      supabase
        .from('committee_folders')
        .select('id, committee_id, parent_id, name, visibility, created_by, created_at')
        .eq('committee_id', committeeId),
      supabase
        .from('committee_files')
        .select('id, file_name, file_size_bytes, storage_path, uploaded_by, created_at, folder_id, doc_type, vendor_id')
        .eq('committee_id', committeeId),
    ]);

    // Resolve uploader names locally (small set, avoids joining profiles in RLS).
    const uploaderIds = Array.from(new Set((fileRows ?? []).map(f => f.uploaded_by).filter((id): id is string => !!id)));
    const uploaderNames: Record<string, string> = {};
    if (uploaderIds.length > 0) {
      const { data: uploaderRows } = await supabase.from('profiles').select('id, full_name, email').in('id', uploaderIds);
      for (const u of uploaderRows ?? []) uploaderNames[u.id] = u.full_name || u.email;
    }

    setFolders(
      (folderRows ?? []).map(f => ({
        id: f.id,
        committeeId: f.committee_id,
        parentId: f.parent_id,
        name: f.name,
        visibility: f.visibility as FolderVisibility,
        createdBy: f.created_by,
        createdAt: f.created_at,
      }))
    );
    setFiles(
      (fileRows ?? []).map(f => ({
        id: f.id,
        fileName: f.file_name,
        fileSizeBytes: f.file_size_bytes,
        storagePath: f.storage_path,
        uploadedByName: f.uploaded_by ? uploaderNames[f.uploaded_by] ?? 'Unknown' : 'Unknown',
        createdAt: new Date(f.created_at).toLocaleString(),
        folderId: f.folder_id,
        docType: (f.doc_type as DocType | null) ?? null,
        vendorId: (f.vendor_id as string | null) ?? null,
      }))
    );
    setIsLoading(false);
  }, [committeeId, supabase]);

  const loadVendors = useCallback(async () => {
    const { data } = await supabase.from('vendors').select('id, name').order('name');
    setVendors(data ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  // If the folder we're viewing was deleted or moved out from under us
  // (another head acting concurrently), fall back to the root rather than
  // showing a dead end.
  useEffect(() => {
    if (isLoading || !currentFolderId) return;
    if (!folders.some(f => f.id === currentFolderId)) setCurrentFolderId(null);
  }, [isLoading, folders, currentFolderId]);

  // Realtime: a folder or file someone else adds/renames/moves/deletes shows
  // up without a refresh.
  useEffect(() => {
    if (!committeeId) return;
    const silentReload = () => load();
    const channel = supabase
      .channel(`folders-${committeeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'committee_folders', filter: `committee_id=eq.${committeeId}` }, silentReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'committee_files', filter: `committee_id=eq.${committeeId}` }, silentReload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [committeeId, supabase, load]);

  const vendorNameById = useMemo(() => new Map(vendors.map(v => [v.id, v.name])), [vendors]);

  const breadcrumbs = buildBreadcrumbs(folders, currentFolderId);
  const visibleFolders = childrenOf(folders, currentFolderId);
  const visibleFiles = files
    .filter(f => f.folderId === currentFolderId)
    .sort((a, b) => a.fileName.localeCompare(b.fileName));

  // Every folder, labelled by its full path, for the "move file" dropdown.
  const folderMoveOptions = useMemo(() => {
    const labelFor = (f: Folder) => buildBreadcrumbs(folders, f.id).map(b => b.name).join(' / ');
    return folders
      .map(f => ({ id: f.id, label: labelFor(f) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [folders]);

  // ---- Folder actions -------------------------------------------------------

  const createFolder = async () => {
    if (!newFolderName.trim() || !profile) return;
    setIsCreatingFolder(true);
    const { data, error } = await supabase
      .from('committee_folders')
      .insert({
        committee_id: committeeId,
        parent_id: currentFolderId,
        name: newFolderName.trim(),
        visibility: newFolderVisibility,
        created_by: profile.id,
      })
      .select('id, committee_id, parent_id, name, visibility, created_by, created_at')
      .single();
    setIsCreatingFolder(false);

    if (error || !data) {
      toast.error(error?.code === '23505' ? 'A folder with that name already exists here.' : 'Could not create that folder.');
      return;
    }
    setFolders(prev => [
      ...prev,
      {
        id: data.id,
        committeeId: data.committee_id,
        parentId: data.parent_id,
        name: data.name,
        visibility: data.visibility as FolderVisibility,
        createdBy: data.created_by,
        createdAt: data.created_at,
      },
    ]);
    setNewFolderName('');
    setNewFolderVisibility('committee');
    setShowNewFolder(false);
    toast.success('Folder created');
  };

  const startEditFolder = (folder: Folder) => {
    setEditingFolderId(folder.id);
    setDraftFolderName(folder.name);
    setDraftFolderVisibility(folder.visibility);
  };

  const cancelEditFolder = () => {
    setEditingFolderId(null);
    setDraftFolderName('');
  };

  const saveFolderEdit = async (folder: Folder) => {
    if (!draftFolderName.trim()) return;

    const changes: { name?: string; visibility?: FolderVisibility } = {};
    if (draftFolderName.trim() !== folder.name) changes.name = draftFolderName.trim();
    if (draftFolderVisibility !== folder.visibility) changes.visibility = draftFolderVisibility;

    if (Object.keys(changes).length === 0) {
      cancelEditFolder();
      return;
    }

    setIsSavingFolder(true);
    const { error } = await supabase.from('committee_folders').update(changes).eq('id', folder.id);
    setIsSavingFolder(false);

    if (error) {
      toast.error(error.code === '23505' ? 'A folder with that name already exists here.' : 'Could not save that change.');
      return;
    }
    setFolders(prev => prev.map(f => (f.id === folder.id ? { ...f, ...changes } : f)));
    toast.success('Saved');
    cancelEditFolder();
  };

  const deleteFolder = async (folder: Folder) => {
    const childFolderCount = folders.filter(f => f.parentId === folder.id).length;
    const childFileCount = files.filter(f => f.folderId === folder.id).length;
    const total = childFolderCount + childFileCount;
    if (total > 0) {
      toast.error(`This folder has ${total} item${total !== 1 ? 's' : ''}. Move or delete them first.`);
      return;
    }

    setFolders(prev => prev.filter(f => f.id !== folder.id));
    const { error } = await supabase.from('committee_folders').delete().eq('id', folder.id);
    if (error) {
      toast.error('Could not delete that folder.');
      load();
    } else {
      toast.success('Folder deleted');
    }
  };

  // ---- File actions ----------------------------------------------------------

  const stagePendingFiles = (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    setPendingFiles(arr);
    setUploadDocType('');
  };

  const cancelUpload = () => {
    setPendingFiles(null);
    setUploadDocType('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmUpload = async () => {
    if (!pendingFiles || pendingFiles.length === 0 || !profile) return;
    setIsUploading(true);
    let failed = 0;
    for (const file of pendingFiles) {
      // Storage path format is unchanged: folders are a database concept only,
      // never encoded into the path.
      const storagePath = `${committeeId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('committee-files').upload(storagePath, file);
      if (!uploadError) {
        await supabase.from('committee_files').insert({
          committee_id: committeeId,
          uploaded_by: profile.id,
          storage_path: storagePath,
          file_name: file.name,
          file_size_bytes: file.size,
          folder_id: currentFolderId,
          doc_type: uploadDocType || null,
        });
      } else {
        failed++;
      }
    }
    setIsUploading(false);
    setPendingFiles(null);
    setUploadDocType('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    await load();
    if (failed > 0) {
      toast.error(`${failed} file${failed !== 1 ? 's' : ''} failed to upload.`);
    } else {
      toast.success('Uploaded');
    }
  };

  const downloadFile = async (f: BrowserFile) => {
    const { data } = await supabase.storage.from('committee-files').createSignedUrl(f.storagePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const deleteFile = async (f: BrowserFile) => {
    setFiles(prev => prev.filter(x => x.id !== f.id));
    const { error: removeError } = await supabase.storage.from('committee-files').remove([f.storagePath]);
    const { error: deleteError } = await supabase.from('committee_files').delete().eq('id', f.id);
    if (removeError || deleteError) {
      toast.error('Could not delete that file.');
      load();
    } else {
      toast.success('File deleted');
    }
  };

  // Moving a file is a single-field control (like the role dropdown elsewhere)
  // — it saves instantly rather than going through a Save/Cancel draft.
  const moveFile = async (f: BrowserFile, targetFolderId: string | null) => {
    if (targetFolderId === f.folderId) return;
    setFiles(prev => prev.map(x => (x.id === f.id ? { ...x, folderId: targetFolderId } : x)));
    const { error } = await supabase.from('committee_files').update({ folder_id: targetFolderId }).eq('id', f.id);
    if (error) {
      toast.error('Could not move that file.');
      load();
    } else {
      toast.success('File moved');
    }
  };

  // Linking a vendor is the same single-field, save-instantly control as
  // moving a file — one dropdown, one column, no multi-field draft needed.
  const linkVendor = async (f: BrowserFile, targetVendorId: string | null) => {
    if (targetVendorId === f.vendorId) return;
    setFiles(prev => prev.map(x => (x.id === f.id ? { ...x, vendorId: targetVendorId } : x)));
    const { error } = await supabase.from('committee_files').update({ vendor_id: targetVendorId }).eq('id', f.id);
    if (error) {
      toast.error('Could not link that vendor.');
      load();
    } else {
      toast.success('Vendor updated');
    }
  };

  // ---- Drag-to-upload ---------------------------------------------------------

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canUpload) return;
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canUpload) return;
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) stagePendingFiles(e.dataTransfer.files);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <button
          onClick={() => setCurrentFolderId(null)}
          className={`px-2 py-1 rounded hover:bg-gray-100 ${currentFolderId === null ? 'font-semibold text-gray-900' : 'text-indigo-600'}`}
        >
          All files
        </button>
        {breadcrumbs.map(b => (
          <span key={b.id} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
            <button
              onClick={() => setCurrentFolderId(b.id)}
              className={`px-2 py-1 rounded hover:bg-gray-100 truncate max-w-[160px] ${b.id === currentFolderId ? 'font-semibold text-gray-900' : 'text-indigo-600'}`}
            >
              {b.name}
            </button>
          </span>
        ))}
      </div>

      {/* New folder */}
      {canManage && (
        showNewFolder ? (
          <div className="flex flex-col gap-2 p-2 border border-indigo-200 bg-indigo-50/60 rounded-lg sm:flex-row sm:items-center">
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createFolder()}
              placeholder="Folder name"
              autoFocus
              className="flex-1 px-3 py-2 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
            />
            <select
              value={newFolderVisibility}
              onChange={e => setNewFolderVisibility(e.target.value as FolderVisibility)}
              className="px-2 py-2 border border-indigo-300 rounded text-sm bg-white focus:outline-none focus:border-indigo-500"
            >
              <option value="committee">This committee only</option>
              <option value="everyone">Shared with everyone</option>
            </select>
            <div className="flex gap-2 shrink-0">
              <button onClick={createFolder} disabled={isCreatingFolder || !newFolderName.trim()} className="px-3 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                {isCreatingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </button>
              <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowNewFolder(true)} className="self-start flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium p-2">
            <FolderPlus className="h-4 w-4" /> New folder
          </button>
        )
      )}

      {/* Upload */}
      {canUpload && (
        <label className="cursor-pointer block">
          <div className="border-2 border-dashed border-indigo-200 rounded-lg p-3 text-center hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2">
            <Upload className="h-4 w-4 text-indigo-400" />
            <span className="text-sm text-indigo-600 font-medium">Upload files</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => e.target.files && stagePendingFiles(e.target.files)}
            disabled={isUploading}
          />
        </label>
      )}

      {/* Staged upload — doc type applies to the whole batch, nothing uploads
          until Upload is clicked. */}
      {pendingFiles && pendingFiles.length > 0 && (
        <div className="p-3 border border-indigo-200 bg-indigo-50/60 rounded-lg flex flex-col gap-2">
          <p className="text-sm text-gray-700">
            Uploading {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} to{' '}
            <span className="font-medium">{currentFolderId ? breadcrumbs[breadcrumbs.length - 1]?.name ?? 'this folder' : 'the root'}</span>:{' '}
            <span className="text-gray-500">{pendingFiles.map(f => f.name).join(', ')}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={uploadDocType}
              onChange={e => setUploadDocType(e.target.value as DocType | '')}
              className="px-2 py-2 border border-indigo-300 rounded text-sm bg-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Document type (optional)</option>
              {DOC_TYPES.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <button onClick={confirmUpload} disabled={isUploading} className="px-3 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Upload'}
            </button>
            <button onClick={cancelUpload} disabled={isUploading} className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Folder + file list. Drop-to-upload target when canUpload. */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border transition-colors ${isDragOver ? 'border-indigo-400 bg-indigo-50/60' : 'border-gray-100'}`}
      >
        {visibleFolders.length === 0 && visibleFiles.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            {isDragOver ? 'Drop to upload' : 'This folder is empty.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {visibleFolders.map(folder => {
              const isEditing = editingFolderId === folder.id;
              if (isEditing) {
                return (
                  <div key={folder.id} className="flex flex-col gap-2 p-3 bg-indigo-50/60 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={draftFolderName}
                      onChange={e => setDraftFolderName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveFolderEdit(folder)}
                      autoFocus
                      className="flex-1 px-3 py-2 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <select
                      value={draftFolderVisibility}
                      onChange={e => setDraftFolderVisibility(e.target.value as FolderVisibility)}
                      className="px-2 py-2 border border-indigo-300 rounded text-sm bg-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="committee">This committee only</option>
                      <option value="everyone">Shared with everyone</option>
                    </select>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => saveFolderEdit(folder)} disabled={isSavingFolder} title="Save" className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
                        {isSavingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button onClick={cancelEditFolder} disabled={isSavingFolder} title="Cancel" className="p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={folder.id} className="flex items-center justify-between gap-2 p-3 hover:bg-gray-50">
                  <button onClick={() => setCurrentFolderId(folder.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                    <FolderIcon className="h-5 w-5 text-indigo-400 shrink-0" />
                    <span className="text-sm font-medium text-gray-900 truncate">{folder.name}</span>
                    {folder.visibility === 'everyone' && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-medium">
                        <Share2 className="h-3 w-3" /> Shared
                      </span>
                    )}
                  </button>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEditFolder(folder)} title="Rename" className="p-2 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteFolder(folder)} title="Delete" className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {visibleFiles.map(f => (
              <div key={f.id} className="flex flex-col gap-2 p-3 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between">
                <button onClick={() => downloadFile(f)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                  <FileIcon className="h-5 w-5 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate hover:text-indigo-600">{f.fileName}</p>
                    <p className="text-xs text-gray-400 flex flex-wrap items-center gap-1">
                      <span>{formatBytes(f.fileSizeBytes)}</span>
                      <span>· {f.uploadedByName}</span>
                      <span>· {f.createdAt}</span>
                      {docTypeLabel(f.docType) && (
                        <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">{docTypeLabel(f.docType)}</span>
                      )}
                      {f.vendorId && vendorNameById.get(f.vendorId) && (
                        <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-medium">{vendorNameById.get(f.vendorId)}</span>
                      )}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                  {canManage && (
                    <select
                      value={f.vendorId ?? ''}
                      onChange={e => linkVendor(f, e.target.value || null)}
                      title="Link to vendor"
                      className="px-2 py-2 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:border-indigo-400 max-w-[140px]"
                    >
                      <option value="">No vendor</option>
                      {vendors.length === 0 ? (
                        <option value="" disabled>No vendors yet</option>
                      ) : (
                        vendors.map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))
                      )}
                    </select>
                  )}
                  {canManage && (
                    <select
                      value={f.folderId ?? ''}
                      onChange={e => moveFile(f, e.target.value || null)}
                      title="Move to folder"
                      className="px-2 py-2 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:border-indigo-400 max-w-[140px]"
                    >
                      <option value="">Committee root</option>
                      {folderMoveOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  )}
                  <button onClick={() => downloadFile(f)} title="Download" className="p-2 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded transition-colors">
                    <Download className="h-4 w-4" />
                  </button>
                  {canManage && (
                    <button onClick={() => deleteFile(f)} title="Delete" className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
