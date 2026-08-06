'use client';

import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Share2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { getUserCommittees, type Committee } from '@/lib/rbac';
import FolderBrowser from '@/components/FolderBrowser';

type SharedFolderRow = {
  id: string;
  name: string;
  committeeId: string;
  committeeName: string;
};

export default function DocumentsPage() {
  const { user, committeeRoles, isAdmin, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [committees, setCommittees] = useState<Committee[]>([]);
  const [sharedFolders, setSharedFolders] = useState<SharedFolderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data: committeeRows } = await supabase.from('committees').select('*').eq('archived', false);
    const all = committeeRows ?? [];
    setCommittees(all);

    // "Shared with everyone" — folders across all committees marked visibility
    // = 'everyone'. Visible to any signed-in member of the event thanks to the
    // "View own committee folders and shared folders" RLS policy, regardless
    // of whether the viewer belongs to that committee.
    const { data: sharedRows } = await supabase
      .from('committee_folders')
      .select('id, name, committee_id')
      .eq('visibility', 'everyone');
    const committeeNameById = new Map(all.map(c => [c.id, c.name]));
    // A shared folder in a committee the viewer isn't part of and that wasn't
    // in the `archived = false` list above still needs a name — fall back to
    // a second lookup for any committee ids missing from the map.
    const missingIds = Array.from(new Set((sharedRows ?? []).map(r => r.committee_id))).filter(id => !committeeNameById.has(id));
    if (missingIds.length > 0) {
      const { data: extraCommittees } = await supabase.from('committees').select('id, name').in('id', missingIds);
      for (const c of extraCommittees ?? []) committeeNameById.set(c.id, c.name);
    }
    setSharedFolders(
      (sharedRows ?? []).map(r => ({
        id: r.id,
        name: r.name,
        committeeId: r.committee_id,
        committeeName: committeeNameById.get(r.committee_id) ?? 'Unknown committee',
      }))
    );
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (authLoading || !user) return;
    load();
  }, [authLoading, user, load]);

  const userCommittees = getUserCommittees(committees, committeeRoles, isAdmin);
  const selectedCommittee = userCommittees.find(c => c.id === selectedCommitteeId) ?? null;

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <FolderOpen className="h-7 w-7 text-indigo-600" /> Documents
          </h1>
          <p className="text-gray-500 text-sm mt-1">Folders and files for the groups you belong to.</p>
        </div>

        {userCommittees.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
            You&apos;re not part of any committee yet, so there are no folders to show. Ask a committee head to add you.
          </div>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row">
            {/* Committee picker */}
            <div className="w-full md:w-56 shrink-0">
              <div className="bg-white rounded-lg shadow-sm p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible">
                {userCommittees.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCommitteeId(c.id)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium text-left whitespace-nowrap shrink-0 transition-colors ${
                      selectedCommitteeId === c.id ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Folder browser for the selected committee */}
            <div className="flex-1 bg-white rounded-lg shadow-sm p-4 min-w-0">
              {selectedCommittee ? (
                <FolderBrowserForCommittee committee={selectedCommittee} />
              ) : (
                <div className="py-10 text-center text-sm text-gray-400">Pick a committee on the left to see its folders.</div>
              )}
            </div>
          </div>
        )}

        {/* Shared with everyone — read-only, across all committees. */}
        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-3">
            <Share2 className="h-5 w-5 text-emerald-600" /> Shared with everyone
          </h2>
          {sharedFolders.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-6 text-center text-sm text-gray-400">
              No folders have been shared with everyone yet.
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-100">
              {sharedFolders.map(f => (
                <div key={f.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="h-5 w-5 text-emerald-500 shrink-0" />
                    <span className="text-sm font-medium text-gray-900 truncate">{f.name}</span>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">{f.committeeName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Wraps FolderBrowser with the same permission logic the committee page uses
// (head of that committee, or a system admin, manages the folder structure).
// isCommitteeHead/isCommitteeMember already fold in isAdmin (see auth-context.tsx).
function FolderBrowserForCommittee({ committee }: { committee: Committee }) {
  const { isCommitteeHead, isCommitteeMember } = useAuth();
  return (
    <FolderBrowser
      committeeId={committee.id}
      canManage={isCommitteeHead(committee.id)}
      canUpload={isCommitteeMember(committee.id)}
    />
  );
}
