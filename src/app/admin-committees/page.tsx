'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Archive, Users, AlertCircle, Save, Trash2 } from 'lucide-react';
import type { Committee, User } from '@/lib/rbac';
import { DEFAULT_COMMITTEES, DEFAULT_USERS } from '@/lib/rbac';

export default function AdminCommitteeManagement() {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', lead: '' });

  useEffect(() => {
    const saved = localStorage.getItem('committees');
    setCommittees(saved ? JSON.parse(saved) : DEFAULT_COMMITTEES);
    const savedUsers = localStorage.getItem('users');
    setUsers(savedUsers ? JSON.parse(savedUsers) : DEFAULT_USERS);
  }, []);

  const saveCommittees = (updated: Committee[]) => {
    setCommittees(updated);
    localStorage.setItem('committees', JSON.stringify(updated));
  };

  const addCommittee = () => {
    if (!formData.name.trim() || !formData.lead) return;
    const newCommittee: Committee = {
      id: 'committee_' + Date.now(),
      name: formData.name,
      description: formData.description,
      lead: formData.lead,
      members: [],
      createdAt: new Date().toISOString(),
      archived: false,
    };
    saveCommittees([...committees, newCommittee]);
    resetForm();
  };

  const updateCommittee = () => {
    if (!formData.name.trim() || !formData.lead || !editingId) return;
    saveCommittees(
      committees.map(c =>
        c.id === editingId ? { ...c, name: formData.name, description: formData.description, lead: formData.lead } : c
      )
    );
    resetForm();
  };

  const deleteCommittee = (id: string) => {
    saveCommittees(committees.filter(c => c.id !== id));
  };

  const archiveCommittee = (id: string) => {
    saveCommittees(committees.map(c => (c.id === id ? { ...c, archived: !c.archived } : c)));
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', lead: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (committee: Committee) => {
    setFormData({ name: committee.name, description: committee.description, lead: committee.lead });
    setEditingId(committee.id);
    setShowForm(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Committee Management</h1>
            <p className="text-gray-600 mt-2">Create, edit, and manage event committees</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
          >
            <Plus className="h-5 w-5" /> New Committee
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-blue-600">
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Committee Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Youth Conference"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Committee Lead *</label>
                <select
                  value={formData.lead}
                  onChange={e => setFormData({ ...formData, lead: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select a lead</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={editingId ? updateCommittee : addCommittee}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
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
            <div className="text-3xl font-bold text-blue-600">{committees.filter(c => !c.archived).length}</div>
            <div className="text-gray-600 text-sm mt-1">Active Committees</div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-3xl font-bold text-gray-600">{committees.filter(c => c.archived).length}</div>
            <div className="text-gray-600 text-sm mt-1">Archived</div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-3xl font-bold text-green-600">{users.length}</div>
            <div className="text-gray-600 text-sm mt-1">Total Users</div>
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
                const leadUser = users.find(u => u.id === committee.lead);
                const memberCount = committee.members.length;
                return (
                  <div
                    key={committee.id}
                    className={`bg-white rounded-lg shadow-sm p-6 flex items-start justify-between hover:shadow-md transition-shadow border-l-4 ${
                      committee.archived ? 'border-gray-300 opacity-60' : 'border-blue-600'
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
                          <Users className="h-4 w-4" /> Lead: <span className="font-medium text-gray-700">{leadUser?.name || 'Unknown'}</span>
                        </div>
                        <div>{memberCount} member{memberCount !== 1 ? 's' : ''}</div>
                        <div className="text-xs text-gray-400">Created {new Date(committee.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => startEdit(committee)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit committee"
                      >
                        <Edit2 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => archiveCommittee(committee.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          committee.archived
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-orange-600 hover:bg-orange-50'
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
