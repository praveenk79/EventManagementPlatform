'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Archive, Users, AlertCircle, Save, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Committee, Profile } from '@/lib/rbac';
import AdminNav from '@/components/AdminNav';
import { useRequireAdmin } from '@/lib/use-require-admin';

function slugify(name: string) {
  return (
    'committee_' +
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') +
    '_' +
    Math.random().toString(36).slice(2, 6)
  );
}

export default function AdminCommitteeManagement() {
  const { allowed, checking } = useRequireAdmin();
  const { profile } = useAuth();
  const supabase = createClient();

  const [committees, setCommittees] = useState<Committee[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [headByCommittee, setHeadByCommittee] = useState<Record<string, Profile | undefined>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', headUserId: '' });
  const formRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data: committeeRows }, { data: profileRows }] = await Promise.all([
      supabase.from('committees').select('*').order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, email, full_name, avatar_url, system_role'),
    ]);
    const allCommittees = committeeRows ?? [];
    setCommittees(allCommittees);
    setProfiles(profileRows ?? []);

    if (allCommittees.length > 0) {
      const { data: memberRows } = await supabase
        .from('committee_members')
        .select('committee_id, role, user_id')
        .in('committee_id', allCommittees.map(c => c.id));

      const counts: Record<string, number> = {};
      const heads: Record<string, Profile | undefined> = {};
      for (const row of memberRows ?? []) {
        counts[row.committee_id] = (counts[row.committee_id] ?? 0) + 1;
        if (row.role === 'head') {
          heads[row.committee_id] = (profileRows ?? []).find(p => p.id === row.user_id);
        }
      }
      setMemberCounts(counts);
      setHeadByCommittee(heads);
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setFormData({ name: '', description: '', headUserId: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const addCommittee = async () => {
    if (!formData.name.trim() || !profile) return;
    const { data: created, error } = await supabase
      .from('committees')
      .insert({ slug: slugify(formData.name), name: formData.name.trim(), description: formData.description.trim(), created_by: profile.id })
      .select()
      .single();
    if (error || !created) {
      toast.error('Could not create that committee.');
      return;
    }

    if (formData.headUserId) {
      await supabase.from('committee_members').insert({ committee_id: created.id, user_id: formData.headUserId, role: 'head' });
    }
    resetForm();
    load();
    toast.success('Committee created');
  };

  const updateCommittee = async () => {
    if (!formData.name.trim() || !editingId) return;
    const { error } = await supabase
      .from('committees')
      .update({ name: formData.name.trim(), description: formData.description.trim() })
      .eq('id', editingId);

    const currentHead = headByCommittee[editingId];
    if (formData.headUserId && formData.headUserId !== currentHead?.id) {
      if (currentHead) {
        await supabase.from('committee_members').delete().eq('committee_id', editingId).eq('user_id', currentHead.id);
      }
      await supabase
        .from('committee_members')
        .upsert({ committee_id: editingId, user_id: formData.headUserId, role: 'head' }, { onConflict: 'committee_id,user_id' });
    }
    resetForm();
    load();
    if (error) {
      toast.error('Could not save all changes.');
    } else {
      toast.success('Committee updated');
    }
  };

  const deleteCommittee = async (id: string) => {
    const { error } = await supabase.from('committees').delete().eq('id', id);
    load();
    if (error) {
      toast.error('Could not delete that committee.');
    } else {
      toast.success('Committee deleted');
    }
  };

  const archiveCommittee = async (id: string, archived: boolean) => {
    const { error } = await supabase.from('committees').update({ archived: !archived }).eq('id', id);
    load();
    if (error) {
      toast.error('Could not update that committee.');
    } else {
      toast.success(archived ? 'Committee unarchived' : 'Committee archived');
    }
  };

  const startEdit = (committee: Committee) => {
    setFormData({ name: committee.name, description: committee.description, headUserId: headByCommittee[committee.id]?.id ?? '' });
    setEditingId(committee.id);
    setShowForm(true);
    // The form renders near the top; without this the pencil looks like it did
    // nothing when you click a committee lower down the list.
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  if (checking || !allowed || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <AdminNav />
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Committee Management</h1>
            <p className="text-gray-600 mt-2">Create, edit, and manage event committees</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2"
          >
            <Plus className="h-5 w-5" /> New Committee
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div ref={formRef} className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-indigo-600">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Edit Committee' : 'New Committee'}
            </h2>
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Committee Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Youth Conference"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Committee Head</label>
                <select
                  value={formData.headUserId}
                  onChange={e => setFormData({ ...formData, headUserId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Assign later</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Only people who&apos;ve signed in at least once can be assigned.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={editingId ? updateCommittee : addCommittee}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2"
              >
                <Save className="h-4 w-4" /> {editingId ? 'Update' : 'Create'}
              </button>
              <button onClick={resetForm} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-3xl font-bold text-indigo-600">{committees.filter(c => !c.archived).length}</div>
            <div className="text-gray-600 text-sm mt-1">Active Committees</div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-3xl font-bold text-gray-600">{committees.filter(c => c.archived).length}</div>
            <div className="text-gray-600 text-sm mt-1">Archived</div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-3xl font-bold text-green-600">{profiles.length}</div>
            <div className="text-gray-600 text-sm mt-1">Registered Users</div>
          </div>
        </div>

        {/* Committees List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">All Committees</h2>
          {committees.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center">
              <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No committees yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {committees.map(committee => {
                const head = headByCommittee[committee.id];
                const memberCount = memberCounts[committee.id] ?? 0;
                return (
                  <div
                    key={committee.id}
                    className={`bg-white rounded-lg shadow-sm p-6 flex items-start justify-between hover:shadow-md transition-shadow border-l-4 ${
                      committee.archived ? 'border-gray-300 opacity-60' : 'border-indigo-600'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{committee.name}</h3>
                        {committee.archived && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-medium">Archived</span>
                        )}
                      </div>
                      <p className="text-gray-600 text-sm mb-3">{committee.description || 'No description'}</p>
                      <div className="flex items-center gap-6 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" /> Head:{' '}
                          <span className="font-medium text-gray-700">{head?.full_name || head?.email || 'Unassigned'}</span>
                        </div>
                        <div>{memberCount} member{memberCount !== 1 ? 's' : ''}</div>
                        <div className="text-xs text-gray-400">Created {new Date(committee.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => startEdit(committee)}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit committee"
                      >
                        <Edit2 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => archiveCommittee(committee.id, committee.archived)}
                        className={`p-2 rounded-lg transition-colors ${
                          committee.archived ? 'text-green-600 hover:bg-green-50' : 'text-orange-600 hover:bg-orange-50'
                        }`}
                        title={committee.archived ? 'Unarchive committee' : 'Archive committee'}
                      >
                        <Archive className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => deleteCommittee(committee.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete committee"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
