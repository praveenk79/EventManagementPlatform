'use client';

import { useState, useEffect } from 'react';
import { Users, Shield, Edit2, Save, X, Plus, Trash2 } from 'lucide-react';
import type { User, Committee, SystemRole, CommitteeRole } from '@/lib/rbac';
import { DEFAULT_USERS, DEFAULT_COMMITTEES } from '@/lib/rbac';

export default function AdminUserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<SystemRole>('member');
  const [editingCommitteeRoles, setEditingCommitteeRoles] = useState<
    { committeeId: string; role: CommitteeRole }[]
  >([]);
  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'member' as SystemRole });

  useEffect(() => {
    const saved = localStorage.getItem('users');
    setUsers(saved ? JSON.parse(saved) : DEFAULT_USERS);
    const savedCommittees = localStorage.getItem('committees');
    setCommittees(savedCommittees ? JSON.parse(savedCommittees) : DEFAULT_COMMITTEES);
  }, []);

  const saveUsers = (updated: User[]) => {
    setUsers(updated);
    localStorage.setItem('users', JSON.stringify(updated));
  };

  const startEdit = (user: User) => {
    setEditingUserId(user.id);
    setEditingRole(user.systemRole);
    setEditingCommitteeRoles([...user.committees]);
  };

  const saveEdit = () => {
    if (!editingUserId) return;
    saveUsers(
      users.map(u =>
        u.id === editingUserId
          ? { ...u, systemRole: editingRole, committees: editingCommitteeRoles }
          : u
      )
    );
    cancelEdit();
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

  const addUser = () => {
    if (!newUser.name.trim() || !newUser.email.trim()) return;
    const user: User = {
      id: 'user_' + Date.now(),
      name: newUser.name,
      email: newUser.email,
      systemRole: newUser.role,
      committees: [],
    };
    saveUsers([...users, user]);
    setNewUser({ name: '', email: '', role: 'member' });
    setShowForm(false);
  };

  const deleteUser = (id: string) => {
    saveUsers(users.filter(u => u.id !== id));
  };

  const getRoleColor = (role: SystemRole) => {
    switch (role) {
      case 'super_user':
        return 'bg-red-100 text-red-800';
      case 'admin':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const permissionMatrix = {
    super_user: {
      icon: '👑',
      description: 'Full access to all portal features and settings',
      permissions: [
        'Create Committees',
        'Manage All Committees',
        'Manage Assigned Committees',
        'View Assigned Committees',
        'Assign Members',
        'Manage Roles',
      ],
    },
    admin: {
      icon: '🔐',
      description: 'Can manage committees, members, and permissions',
      permissions: [
        'Create Committees',
        'Manage All Committees',
        'Manage Assigned Committees',
        'View Assigned Committees',
        'Assign Members',
        'Manage Roles',
      ],
    },
    member: {
      icon: '👤',
      description: 'Standard user with basic access (default)',
      permissions: ['View Assigned Committees'],
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">User & Role Management</h1>
            <p className="text-gray-600 mt-2">Manage user roles and committee assignments</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
          >
            <Plus className="h-5 w-5" /> Add User
          </button>
        </div>

        {/* Add User Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-green-600">
            <div className="grid grid-cols-4 gap-6 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name *</label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="John Doe"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="john@event.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">System Role</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value as SystemRole })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-green-500"
                >
                  <option value="member">Member (Default)</option>
                  <option value="admin">Admin</option>
                  <option value="super_user">Super User</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={addUser}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  Create User
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Permission Matrix */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" /> Permission Matrix
          </h2>
          <div className="grid grid-cols-3 gap-6">
            {Object.entries(permissionMatrix).map(([role, info]) => (
              <div key={role} className="border border-gray-200 rounded-lg p-4">
                <div className="text-3xl mb-2">{info.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 capitalize mb-1">
                  {role.replace('_', ' ')}
                </h3>
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
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6" /> Users ({users.length})
          </h2>
          <div className="space-y-3">
            {users.map(user => (
              <div key={user.id} className="bg-white rounded-lg shadow-sm p-6">
                {editingUserId === user.id ? (
                  // Edit Mode
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Edit {user.name} - System Role
                      </h3>
                      <select
                        value={editingRole}
                        onChange={e => setEditingRole(e.target.value as SystemRole)}
                        className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="super_user">Super User</option>
                      </select>
                    </div>

                    {editingRole === 'member' && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Committee Roles</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {committees
                            .filter(c => !c.archived)
                            .map(committee => {
                              const hasRole = editingCommitteeRoles.some(c => c.committeeId === committee.id);
                              return (
                                <div key={committee.id} className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={hasRole}
                                    onChange={() =>
                                      toggleCommitteeRole(committee.id, hasRole ? 'committee_member' : 'committee_head')
                                    }
                                    className="rounded w-4 h-4"
                                  />
                                  <label className="flex-1">
                                    <div className="font-medium text-gray-900">{committee.name}</div>
                                    <div className="text-xs text-gray-500">
                                      {hasRole
                                        ? editingCommitteeRoles.find(c => c.committeeId === committee.id)?.role ===
                                          'committee_head'
                                          ? 'Committee Head'
                                          : 'Committee Member'
                                        : 'Not assigned'}
                                    </div>
                                  </label>
                                  {hasRole && (
                                    <select
                                      value={
                                        editingCommitteeRoles.find(c => c.committeeId === committee.id)?.role ||
                                        'committee_member'
                                      }
                                      onChange={e =>
                                        setEditingCommitteeRoles(
                                          editingCommitteeRoles.map(c =>
                                            c.committeeId === committee.id
                                              ? { ...c, role: e.target.value as CommitteeRole }
                                              : c
                                          )
                                        )
                                      }
                                      className="px-2 py-1 border border-gray-200 rounded text-xs"
                                    >
                                      <option value="committee_head">Head</option>
                                      <option value="committee_member">Member</option>
                                    </select>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
                      >
                        <Save className="h-4 w-4" /> Save Changes
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{user.name}</h3>
                      <p className="text-sm text-gray-600 mb-3">{user.email}</p>
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleColor(user.systemRole)}`}>
                          {user.systemRole === 'super_user'
                            ? 'Super User'
                            : user.systemRole.charAt(0).toUpperCase() + user.systemRole.slice(1)}
                        </span>
                        {user.committees.length > 0 && (
                          <span className="text-sm text-gray-600">
                            Member of {user.committees.length} committee{user.committees.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {user.committees.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {user.committees.map(uc => {
                            const committee = committees.find(c => c.id === uc.committeeId);
                            return (
                              <span key={uc.committeeId} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                {committee?.name} ({uc.role === 'committee_head' ? 'Head' : 'Member'})
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => startEdit(user)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => deleteUser(user.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
