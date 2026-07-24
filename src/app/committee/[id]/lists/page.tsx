'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Table2, Trash2, Loader2, ArrowLeft, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Committee } from '@/lib/rbac';
import { LIST_TEMPLATES, getTemplate } from '@/lib/list-templates';

interface ListRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export default function CommitteeListsIndex() {
  const params = useParams();
  const router = useRouter();
  const committeeId = (params.id as string) ?? '';
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, isCommitteeHead } = useAuth();

  const [committee, setCommittee] = useState<Committee | null>(null);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [rowCounts, setRowCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [templateKey, setTemplateKey] = useState('blank');

  const isHead = isCommitteeHead(committeeId);

  const load = useCallback(async () => {
    if (!committeeId || !user) return;
    setIsLoading(true);
    const { data: committeeRow } = await supabase.from('committees').select('*').eq('id', committeeId).single();
    setCommittee(committeeRow ?? null);

    const { data: listRows } = await supabase
      .from('committee_lists')
      .select('id, name, description, created_at')
      .eq('committee_id', committeeId)
      .order('created_at', { ascending: true });
    const all = listRows ?? [];
    setLists(all);

    if (all.length > 0) {
      const { data: rows } = await supabase.from('committee_list_rows').select('list_id').in('list_id', all.map(l => l.id));
      const counts: Record<string, number> = {};
      for (const r of rows ?? []) counts[r.list_id] = (counts[r.list_id] ?? 0) + 1;
      setRowCounts(counts);
    }
    setIsLoading(false);
  }, [committeeId, user, supabase]);

  useEffect(() => { load(); }, [load]);

  const createList = async () => {
    if (!newName.trim() || !profile) return;
    setCreating(true);
    const template = getTemplate(templateKey);

    const { data: created, error } = await supabase
      .from('committee_lists')
      .insert({ committee_id: committeeId, name: newName.trim(), created_by: profile.id })
      .select('id')
      .single();

    if (error || !created) {
      setCreating(false);
      toast.error('Could not create that list.');
      return;
    }

    // Seed columns from the chosen template.
    const cols = (template?.columns ?? [{ label: 'Name', type: 'text' as const }]).map((c, i) => ({
      list_id: created.id,
      label: c.label,
      type: c.type,
      options: c.options ?? [],
      position: i,
    }));
    await supabase.from('committee_list_columns').insert(cols);

    setCreating(false);
    setShowCreate(false);
    setNewName('');
    setTemplateKey('blank');
    router.push(`/committee/${committeeId}/lists/${created.id}`);
  };

  const deleteList = async (id: string) => {
    setLists(prev => prev.filter(l => l.id !== id));
    const { error } = await supabase.from('committee_lists').delete().eq('id', id);
    if (error) {
      toast.error('Could not delete that list.');
    } else {
      toast.success('List deleted');
    }
    load();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <Link href={`/committee/${committeeId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to {committee?.name ?? 'committee'}
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Lists</h1>
            <p className="text-gray-500 text-sm mt-1">Shared, editable tables — like a spreadsheet everyone can see live.</p>
          </div>
          {isHead && (
            <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2">
              <Plus className="h-5 w-5" /> New List
            </button>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => !creating && setShowCreate(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">New List</h2>
                <button onClick={() => setShowCreate(false)} disabled={creating}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
              </div>

              <label className="block text-sm font-semibold text-gray-700 mb-1">List name</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g., Speakers"
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 mb-4"
              />

              <label className="block text-sm font-semibold text-gray-700 mb-2">Start from a template</label>
              <div className="space-y-2 max-h-64 overflow-y-auto mb-5">
                {LIST_TEMPLATES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => { setTemplateKey(t.key); if (!newName.trim() && t.key !== 'blank') setNewName(t.name); }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${templateKey === t.key ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className="font-medium text-sm text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.description}</div>
                    {t.key !== 'blank' && (
                      <div className="text-xs text-gray-400 mt-1">{t.columns.map(c => c.label).join(' · ')}</div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={createList} disabled={!newName.trim() || creating} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create List'}
                </button>
                <button onClick={() => setShowCreate(false)} disabled={creating} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Lists */}
        {lists.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Table2 className="h-14 w-14 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No lists yet</h3>
            <p className="text-gray-500 text-sm">
              {isHead ? 'Create a list to replace those scattered spreadsheets — Speakers, Sponsors, guests, and more.' : 'A committee head can create lists here.'}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {lists.map(list => (
              <div key={list.id} className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-5 flex items-start justify-between border-l-4 border-indigo-500">
                <Link href={`/committee/${committeeId}/lists/${list.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Table2 className="h-5 w-5 text-indigo-500 shrink-0" />
                    <h3 className="font-semibold text-gray-900 truncate">{list.name}</h3>
                  </div>
                  <p className="text-sm text-gray-500">{rowCounts[list.id] ?? 0} row{(rowCounts[list.id] ?? 0) !== 1 ? 's' : ''}</p>
                </Link>
                {isHead && (
                  <button onClick={() => deleteList(list.id)} className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0" title="Delete list" aria-label="Delete list">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
