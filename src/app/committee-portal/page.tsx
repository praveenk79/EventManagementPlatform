'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Lock, Unlock, Shield, ArrowRight, Settings, Award } from 'lucide-react';
import type { User, Committee } from '@/lib/rbac';
import { DEFAULT_USERS, DEFAULT_COMMITTEES, getUserCommittees, hasPermission, getCommitteeRole } from '@/lib/rbac';

export default function CommitteePortal() {
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('committees');
    setCommittees(saved ? JSON.parse(saved) : DEFAULT_COMMITTEES);

    const savedUsers = localStorage.getItem('users');
    const userList = savedUsers ? JSON.parse(savedUsers) : DEFAULT_USERS;
    setUsers(userList);

    // Load current user
    const storedUser = localStorage.getItem('current_user');
    const userId = storedUser ? JSON.parse(storedUser) : 'user_admin';
    const user = userList.find((u: User) => u.id === userId);
    if (user) {
      setCurrentUser(user);
    }
  }, []);

  const switchUser = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      setCurrentUser(user);
      localStorage.setItem('current_user', JSON.stringify(user.id));
    }
  };

  const userCommittees = currentUser ? getUserCommittees(currentUser, committees) : [];

  const canCreateCommittees =
    currentUser && hasPermission(currentUser.systemRole, 'CREATE_COMMITTEES');
  const canManageAllCommittees =
    currentUser && hasPermission(currentUser.systemRole, 'MANAGE_ALL_COMMITTEES');

  const getRoleIcon = (systemRole: string) => {
    switch (systemRole) {
      case 'super_user':
        return '👑';
      case 'admin':
        return '🔐';
      default:
        return '👤';
    }
  };

  const getCommitteeRoleColor = (role: string) => {
    return role === 'committee_head'
      ? 'bg-purple-100 text-purple-800'
      : 'bg-blue-100 text-blue-800';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* User Switcher (for demo) */}
        <div className="mb-8 bg-white rounded-lg shadow-sm p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-600 mb-2 font-semibold">Demo: Switch User to See Different Permissions</p>
          <div className="flex flex-wrap gap-2">
            {users.map(u => (
              <button
                key={u.id}
                onClick={() => switchUser(u.id)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  currentUser?.id === u.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {getRoleIcon(u.systemRole)} {u.name}
              </button>
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Committee Portal</h1>
              {currentUser && (
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-gray-600">Logged in as: <span className="font-semibold">{currentUser.name}</span></p>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      currentUser.systemRole === 'super_user'
                        ? 'bg-red-100 text-red-800'
                        : currentUser.systemRole === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {currentUser.systemRole === 'super_user'
                      ? 'Super User'
                      : currentUser.systemRole.charAt(0).toUpperCase() + currentUser.systemRole.slice(1)}
                  </span>
                </div>
              )}
            </div>
            {canCreateCommittees && (
              <Link
                href="/admin-committees"
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
              >
                <Settings className="h-5 w-5" /> Manage Committees
              </Link>
            )}
          </div>
        </div>

        {/* Permissions Info */}
        {currentUser && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5" /> Your Permissions
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded p-4">
                <div className="text-sm font-semibold text-gray-900">Create Committees</div>
                <div className="text-2xl mt-2">
                  {hasPermission(currentUser.systemRole, 'CREATE_COMMITTEES') ? '✓' : '✗'}
                </div>
              </div>
              <div className="bg-white rounded p-4">
                <div className="text-sm font-semibold text-gray-900">Manage All</div>
                <div className="text-2xl mt-2">
                  {hasPermission(currentUser.systemRole, 'MANAGE_ALL_COMMITTEES') ? '✓' : '✗'}
                </div>
              </div>
              <div className="bg-white rounded p-4">
                <div className="text-sm font-semibold text-gray-900">Manage Assigned</div>
                <div className="text-2xl mt-2">
                  {hasPermission(currentUser.systemRole, 'MANAGE_ASSIGNED_COMMITTEES') ? '✓' : '✗'}
                </div>
              </div>
              <div className="bg-white rounded p-4">
                <div className="text-sm font-semibold text-gray-900">Assign Members</div>
                <div className="text-2xl mt-2">
                  {hasPermission(currentUser.systemRole, 'ASSIGN_MEMBERS') ? '✓' : '✗'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Committees */}
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Your Committees ({userCommittees.length})
            </h2>
            {canManageAllCommittees && (
              <Link
                href="/admin-users"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
              >
                Manage Roles & Users
              </Link>
            )}
          </div>

          {userCommittees.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Lock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Committees Yet</h3>
              <p className="text-gray-600">
                You don&apos;t have access to any committees. Ask an admin to assign you to a committee.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {userCommittees.map(committee => {
                const committeeRole = getCommitteeRole(currentUser!, committee.id);
                const lead = users.find(u => u.id === committee.lead);
                const canManage =
                  currentUser &&
                  (hasPermission(currentUser.systemRole, 'MANAGE_ALL_COMMITTEES') ||
                    (committeeRole && hasPermission(currentUser.systemRole, 'MANAGE_ASSIGNED_COMMITTEES', committeeRole)));

                return (
                  <div
                    key={committee.id}
                    className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow p-6 border-l-4 border-blue-600"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-900">{committee.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{committee.description}</p>
                      </div>
                      {canManage && <Unlock className="h-5 w-5 text-green-600 flex-shrink-0" />}
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="h-4 w-4" />
                        <span>Lead: <span className="font-semibold text-gray-900">{lead?.name || 'Unknown'}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Award className="h-4 w-4" />
                        <span>
                          Your Role: <span className={`font-semibold px-2 py-1 rounded text-xs ${getCommitteeRoleColor(committeeRole || 'committee_member')}`}>
                            {committeeRole === 'committee_head' ? 'Committee Head' : committeeRole === 'committee_member' ? 'Committee Member' : 'View Only'}
                          </span>
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <span>{committee.members.length} member{committee.members.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    <Link
                      href={`/committee/${committee.id}`}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      View Tasks
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-12 bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-900 mb-2">About Committee Roles</h3>
          <ul className="space-y-2 text-sm text-green-800">
            <li className="flex items-start gap-2">
              <span className="font-bold">Committee Head:</span>
              <span>Full access to manage committee, assign members, and oversee tasks</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">Committee Member:</span>
              <span>Can view and work on assigned tasks within the committee</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">Admin/Super User:</span>
              <span>Can manage all committees and system-wide roles</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
