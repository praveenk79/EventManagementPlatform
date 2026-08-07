'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Shield, Edit2, Save, Loader2, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useEvent } from '@/lib/event-context';
import type { Profile, Committee, CommitteeRole, SystemRole } from '@/lib/rbac';
import AdminNav from '@/components/AdminNav';
import { useRequireAdmin } from '@/lib/use-require-admin';

type EditableSystemRole = 'member' | 'admin';

// profiles rows carry soft-delete columns (supabase/soft_delete_users.sql) that
// the shared Profile type doesn't model.
type ManagedProfile = Profile & { deleted_at: string | null };

const permissionMatrix: Record<SystemRole, { icon: string; description: string; permissions: string[] }> = {
  super_admin: {
    icon: '👑',
    description: 'Permanent full access — locked to specific accounts, cannot be changed here',
    permissions: ['Manage All Committees', 'Manage Users & Roles', 'View Admin Dashboard', 'Manage Program'],
  },
  admin: {
    icon: '🔐',
    description: 'Can manage committees, members, and permissions',
    permissions: ['Manage All Committees', 'Manage Users & Roles', 'View Admin Dashboard', 'Manage Program'],
  },
  member: {
    icon: '👤',
    description: 'Standard user with basic access (default for everyone who signs in)',
    permissions: ['View Program'],
  },
};

export default function AdminUserManagement() {
  const { allowed, checking } = useRequireAdmin();
  const { profile: currentUser } = useAuth();
  const { events } = useEvent();
  const supabase = createClient();
  const [profiles, setProfiles] = useState<ManagedProfile[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [memberships, setMemberships] = useState<{ committee_id: string; user_id: string; role: CommitteeRole }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<EditableSystemRole>('member');
  const [editingCommitteeRoles, setEditingCommitteeRoles] = useState<{ committeeId: string; role: CommitteeRole }[]>([]);

  // Delete is destructive enough to need an explicit confirm step rather than a
  // one-click action buried among the row's other buttons.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data: profileRows }, { data: committeeRows }, { data: membershipRows }] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, avatar_url, system_role, deleted_at').order('email'),
      supabase.from('committees').select('*').eq('archived', false),
      supabase.from('committee_members').select('committee_id, user_id, role'),
    ]);
    setProfiles((profileRows ?? []) as ManagedProfile[]);
    setCommittees(committeeRows ?? []);
    setMemberships(membershipRows ?? []);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const membershipsForUser = (userId: string) => memberships.filter(m => m.user_id === userId);

  // Group committees by event for the assignment picker below — an admin
  // assigning someone needs to know which event each committee belongs to,
  // not just its name (a company can now have more than one event).
  const committeesByEvent = new Map<string, Committee[]>();
  for (const c of committees) {
    const list = committeesByEvent.get(c.event_id) ?? [];
    list.push(c);
    committeesByEvent.set(c.event_id, list);
  }
  const committeeEventGroups = events
    .filter(e => committeesByEvent.has(e.id))
    .map(e => ({ event: e, committees: committeesByEvent.get(e.id)! }));

  // Soft delete: the profile row stays so their name keeps showing on the tasks
  // and messages they left behind — only their access goes away. The RPC does
  // the stamp + membership strip + role reset in one transaction.
  const deleteUser = async (p: ManagedProfile) => {
    setBusyUserId(p.id);
    const { error } = await supabase.rpc('soft_delete_user', { target_user_id: p.id });
    setBusyUserId(null);
    setConfirmDeleteId(null);

    if (error) {
      toast.error(error.message || 'Could not remove this user.');
      return;
    }
    toast.success(`${p.full_name || p.email} no longer has access`);
    load();
  };

  const restoreUser = async (p: ManagedProfile) => {
    setBusyUserId(p.id);
    const { error } = await supabase.rpc('restore_user', { target_user_id: p.id });
    setBusyUserId(null);

    if (error) {
      toast.error(error.message || 'Could not restore this user.');
      return;
    }
    toast.success(`${p.full_name || p.email} restored as a member`);
    load();
  };

  const startEdit = (p: ManagedProfile) => {
    setEditingUserId(p.id);
    setEditingRole(p.system_role === 'admin' ? 'admin' : 'member');
    setEditingCommitteeRoles(membershipsForUser(p.id).map(m => ({ committeeId: m.committee_id, role: m.role })));
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditingRole('member');
    setEditingCommitteeRoles([]);
  };

  const toggleCommitteeRole = (committeeId: string, role: CommitteeRole) => {
    const existing = editingCommitteeRoles.find(c => c.committeeId === committeeId);
    if (existing) {
      setEditingCommitteeRoles(editingCommitteeRoles.filter(c => c.committeeId !== committeeId));
    } else {
      setEditingCommitteeRoles([...editingCommitteeRoles, { committeeId, role }]);
    }
  };

  const saveEdit = async () => {
    if (!editingUserId) return;
    const target = profiles.find(p => p.id === editingUserId);
    if (!target) return;

    let hadError = false;

    if (target.system_role !== 'super_admin') {
      const { error } = await supabase.from('profiles').update({ system_role: editingRole }).eq('id', editingUserId);
      if (error) hadError = true;
    }

    const before = membershipsForUser(editingUserId);
    const removed = before.filter(b => !editingCommitteeRoles.some(e => e.committeeId === b.committee_id));
    const added = editingCommitteeRoles.filter(e => !before.some(b => b.committee_id === e.committeeId));
    const changed = editingCommitteeRoles.filter(e => {
      const prior = before.find(b => b.committee_id === e.committeeId);
      return prior && prior.role !== e.role;
    });

    const results = await Promise.all([
      ...removed.map(r => supabase.from('committee_members').delete().eq('committee_id', r.committee_id).eq('user_id', editingUserId)),
      ...added.map(a => supabase.from('committee_members').insert({ committee_id: a.committeeId, user_id: editingUserId, role: a.role })),
      ...changed.map(c => supabase.from('committee_members').update({ role: c.role }).eq('committee_id', c.committeeId).eq('user_id', editingUserId)),
    ]);
    if (results.some(r => r.error)) hadError = true;

    cancelEdit();
    load();

    if (hadError) {
      toast.error('Some changes could not be saved.');
    } else {
      toast.success('Changes saved');
    }
  };

  const getRoleColor = (role: SystemRole) => {
    switch (role) {
      case 'super_admin':
        return 'bg-red-100 text-red-800';
      case 'admin':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const roleLabel = (role: SystemRole) => (role === 'super_admin' ? 'Super Admin' : role.charAt(0).toUpperCase() + role.slice(1));

  // Removed users are hidden behind a toggle rather than dropped from the page,
  // so an accidental delete is visibly recoverable.
  const activeProfiles = profiles.filter(p => !p.deleted_at);
  const removedProfiles = profiles.filter(p => p.deleted_at);
  const visibleProfiles = showRemoved ? [...activeProfiles, ...removedProfiles] : activeProfiles;

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
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">User & Role Management</h1>
          <p className="text-gray-600 mt-2">
            Manage roles and committee assignments for everyone who has signed in with Google. New users appear here automatically after their first sign-in.
          </p>
        </div>

        {/* Permission Matrix */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Shield className="h-6 w-6 text-indigo-600" /> Permission Matrix
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {Object.entries(permissionMatrix).map(([role, info]) => (
              <div key={role} className="border border-gray-200 rounded-lg p-4">
                <div className="text-3xl mb-2">{info.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 capitalize mb-1">{role.replace('_', ' ')}</h3>
                <p className="text-sm text-gray-600 mb-4">{info.description}</p>
                <div className="space-y-2">
                  {info.permissions.map(perm => (
                    <div key={perm} className="flex items-center gap-2 text-sm">
                      <span className="text-green-600">✓</span>
                      <span className="text-gray-700">{perm}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Users List */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-6 w-6" /> Users ({activeProfiles.length})
            </h2>
            {removedProfiles.length > 0 && (
              <button
                onClick={() => setShowRemoved(!showRemoved)}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
              >
                {showRemoved ? 'Hide' : 'Show'} removed ({removedProfiles.length})
              </button>
            )}
          </div>
          {activeProfiles.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center text-gray-500">No one has signed in yet.</div>
          ) : (
            <div className="space-y-3">
              {visibleProfiles.map(p => {
                const userMemberships = membershipsForUser(p.id);
                const isRemoved = !!p.deleted_at;
                return (
                  <div key={p.id} className={`rounded-lg shadow-sm p-6 ${isRemoved ? 'bg-gray-100 border border-gray-200' : 'bg-white'}`}>
                    {editingUserId === p.id ? (
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit {p.full_name || p.email} — System Role</h3>
                          {p.system_role === 'super_admin' ? (
                            <p className="text-sm text-gray-500">Super Admin is permanent for this account and can&apos;t be changed here.</p>
                          ) : (
                            <select
                              value={editingRole}
                              onChange={e => setEditingRole(e.target.value as EditableSystemRole)}
                              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          )}
                        </div>

                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">Committee Roles</h4>
                          <div className="space-y-4 max-h-64 overflow-y-auto">
                            {committeeEventGroups.map(({ event, committees: eventCommittees }) => (
                              <div key={event.id}>
                                {committeeEventGroups.length > 1 && (
                                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{event.name}</div>
                                )}
                                <div className="space-y-2">
                                  {eventCommittees.map(committee => {
                                    const hasRole = editingCommitteeRoles.some(c => c.committeeId === committee.id);
                                    const currentRole = editingCommitteeRoles.find(c => c.committeeId === committee.id)?.role;
                                    return (
                                      <div key={committee.id} className="flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          checked={hasRole}
                                          onChange={() => toggleCommitteeRole(committee.id, 'volunteer')}
                                          className="rounded w-4 h-4"
                                        />
                                        <label className="flex-1">
                                          <div className="font-medium text-gray-900">{committee.name}</div>
                                          <div className="text-xs text-gray-500">
                                            {hasRole ? (currentRole === 'head' ? 'Committee Head' : 'Volunteer') : 'Not assigned'}
                                          </div>
                                        </label>
                                        {hasRole && (
                                          <select
                                            value={currentRole || 'volunteer'}
                                            onChange={e =>
                                              setEditingCommitteeRoles(
                                                editingCommitteeRoles.map(c =>
                                                  c.committeeId === committee.id ? { ...c, role: e.target.value as CommitteeRole } : c
                                                )
                                              )
                                            }
                                            className="px-2 py-1 border border-gray-200 rounded text-xs"
                                          >
                                            <option value="head">Head</option>
                                            <option value="volunteer">Volunteer</option>
                                          </select>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={saveEdit}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2"
                          >
                            <Save className="h-4 w-4" /> Save Changes
                          </button>
                          <button onClick={cancelEdit} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-lg font-semibold ${isRemoved ? 'text-gray-500' : 'text-gray-900'}`}>{p.full_name || 'Unnamed'}</h3>
                          <p className="text-sm text-gray-600 mb-3">{p.email}</p>
                          <div className="flex flex-wrap items-center gap-3 mb-3">
                            {isRemoved ? (
                              <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-200 text-gray-700">Access removed</span>
                            ) : (
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleColor(p.system_role)}`}>
                                {roleLabel(p.system_role)}
                              </span>
                            )}
                            {userMemberships.length > 0 && (
                              <span className="text-sm text-gray-600">
                                Member of {userMemberships.length} committee{userMemberships.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {userMemberships.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {userMemberships.map(m => {
                                const committee = committees.find(c => c.id === m.committee_id);
                                return (
                                  <span key={m.committee_id} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                    {committee?.name} ({m.role === 'head' ? 'Head' : 'Volunteer'})
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4 shrink-0">
                          {isRemoved ? (
                            <button
                              onClick={() => restoreUser(p)}
                              disabled={busyUserId === p.id}
                              title="Restore access"
                              className="p-2 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 text-sm font-medium"
                            >
                              {busyUserId === p.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
                              Restore
                            </button>
                          ) : (
                            <>
                              <button onClick={() => startEdit(p)} title="Edit roles" className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                <Edit2 className="h-5 w-5" />
                              </button>
                              {/* Super admins are permanent, and deleting yourself is
                                  never intentional — the RPC rejects both, so don't
                                  offer the button. */}
                              {p.system_role !== 'super_admin' && p.id !== currentUser?.id && (
                                <button
                                  onClick={() => setConfirmDeleteId(p.id)}
                                  title="Remove access"
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Confirm step — spells out exactly what happens, since
                        "delete" here means access, not history. */}
                    {confirmDeleteId === p.id && (
                      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-2 mb-3">
                          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                          <div className="text-sm text-red-800">
                            <p className="font-semibold mb-1">Remove {p.full_name || p.email}?</p>
                            <p>
                              They lose access to everything and are taken off{' '}
                              {userMemberships.length > 0
                                ? `${userMemberships.length} committee${userMemberships.length !== 1 ? 's' : ''}`
                                : 'all committees'}
                              . Their name stays on tasks and messages they&apos;ve already been part of, and you can restore them later.
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => deleteUser(p)}
                            disabled={busyUserId === p.id}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-60 flex items-center gap-2"
                          >
                            {busyUserId === p.id && <Loader2 className="h-4 w-4 animate-spin" />}
                            Yes, remove access
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
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
