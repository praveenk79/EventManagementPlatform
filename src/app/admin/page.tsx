'use client';

import { useState, useEffect } from 'react';
import { Users, CheckSquare, AlertCircle, TrendingUp, Calendar, Plane, Utensils, Hotel, Music, Award, Megaphone, Globe, Palette, DollarSign, UserCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { DEFAULT_COMMITTEES } from '@/lib/rbac';
import type { Committee } from '@/lib/rbac';

interface CommitteeMeta {
  icon: LucideIcon;
  color: string;
  tasks: { total: number; completed: number; pending: number; blocked: number };
}

// Metadata for UI rendering
const COMMITTEE_METADATA: Record<string, CommitteeMeta> = {
  'committee_youth': { icon: Users, color: 'blue', tasks: { total: 15, completed: 8, pending: 5, blocked: 2 } },
  'committee_awards': { icon: Award, color: 'yellow', tasks: { total: 10, completed: 4, pending: 4, blocked: 2 } },
  'committee_speakers': { icon: Megaphone, color: 'purple', tasks: { total: 20, completed: 17, pending: 2, blocked: 1 } },
  'committee_registration': { icon: UserCheck, color: 'green', tasks: { total: 12, completed: 8, pending: 3, blocked: 1 } },
  'committee_website': { icon: Globe, color: 'indigo', tasks: { total: 18, completed: 8, pending: 7, blocked: 3 } },
  'committee_flyer': { icon: Palette, color: 'pink', tasks: { total: 8, completed: 8, pending: 0, blocked: 0 } },
  'committee_sponsors': { icon: DollarSign, color: 'emerald', tasks: { total: 15, completed: 15, pending: 0, blocked: 0 } },
  'committee_hotel': { icon: Hotel, color: 'cyan', tasks: { total: 10, completed: 6, pending: 3, blocked: 1 } },
  'committee_food': { icon: Utensils, color: 'orange', tasks: { total: 14, completed: 9, pending: 4, blocked: 1 } },
  'committee_travel': { icon: Plane, color: 'sky', tasks: { total: 12, completed: 7, pending: 4, blocked: 1 } },
  'committee_entertainment': { icon: Music, color: 'violet', tasks: { total: 8, completed: 5, pending: 2, blocked: 1 } },
  'committee_executive': { icon: Calendar, color: 'rose', tasks: { total: 10, completed: 6, pending: 3, blocked: 1 } },
};

const urgentTasks = [
  { id: 1, title: 'Coordinate celebrity arrival with hotel check-in', committees: ['Travel Arrangements', 'Hotel & Accommodation'], dueDate: '2026-07-25' },
  { id: 2, title: 'Finalize executive dinner menu with dietary requirements', committees: ['Executive Dinner', 'Food Committee'], dueDate: '2026-07-26' },
  { id: 3, title: 'Sync speaker bios with website', committees: ['Speaker Coordination', 'Website Communications'], dueDate: '2026-07-27' },
  { id: 4, title: 'Get registration count for food planning', committees: ['Registration Committee', 'Food Committee'], dueDate: '2026-07-28' },
];

export default function AdminDashboard() {
  const [committees, setCommittees] = useState<Committee[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('committees');
    setCommittees(saved ? JSON.parse(saved) : DEFAULT_COMMITTEES);
  }, []);

  const totalTasks = Object.values(COMMITTEE_METADATA).reduce((sum, c) => sum + c.tasks.total, 0);
  const completedTasks = Object.values(COMMITTEE_METADATA).reduce((sum, c) => sum + c.tasks.completed, 0);
  const pendingTasks = Object.values(COMMITTEE_METADATA).reduce((sum, c) => sum + c.tasks.pending, 0);
  const blockedTasks = Object.values(COMMITTEE_METADATA).reduce((sum, c) => sum + c.tasks.blocked, 0);
  const overallProgress = Math.round((completedTasks / totalTasks) * 100);

  const getCommitteeProgress = (id: string) => {
    const meta = COMMITTEE_METADATA[id];
    if (!meta) return 50;
    return Math.round((meta.tasks.completed / meta.tasks.total) * 100);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Single pane of glass - All committees at a glance</p>
        </div>

        {/* Overall Stats */}
        <div className="grid md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-blue-600">{overallProgress}%</div>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
            <div className="text-gray-600 text-sm">Overall Progress</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-green-600">{completedTasks}</div>
              <CheckSquare className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-gray-600 text-sm">Completed Tasks</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-yellow-600">{pendingTasks}</div>
              <AlertCircle className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="text-gray-600 text-sm">Pending Tasks</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-red-600">{blockedTasks}</div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <div className="text-gray-600 text-sm">Blocked Tasks</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-purple-600">{committees.length}</div>
              <Users className="h-8 w-8 text-purple-600" />
            </div>
            <div className="text-gray-600 text-sm">Active Committees</div>
          </div>
        </div>

        {/* Urgent Cross-Committee Tasks */}
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-red-900 mb-4 flex items-center">
            <AlertCircle className="h-6 w-6 mr-2" />
            Urgent Cross-Committee Coordination
          </h2>
          <div className="space-y-3">
            {urgentTasks.map(task => (
              <div key={task.id} className="bg-white rounded p-4 shadow-sm">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{task.title}</h3>
                    <div className="flex gap-2 mt-2">
                      {task.committees.map((c, idx) => (
                        <span key={idx} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">{c}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-sm text-red-600 font-medium">Due: {task.dueDate}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* All Committees Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">All Committees Status</h2>
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
            {committees.map(committee => {
              const meta = COMMITTEE_METADATA[committee.id];
              if (!meta) return null;
              
              const Icon = meta.icon;
              const progress = getCommitteeProgress(committee.id);
              const statusColor = progress === 100 ? 'green' : progress >= 70 ? 'blue' : progress >= 40 ? 'yellow' : 'red';

              return (
                <Link
                  key={committee.id}
                  href={`/committee/${committee.id}`}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-5 border-l-4"
                  style={{ borderLeftColor: `var(--color-${meta.color})` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-12 h-12 bg-${meta.color}-100 rounded-lg flex items-center justify-center`}>
                      <Icon className={`h-6 w-6 text-${meta.color}-600`} />
                    </div>
                    <div className={`text-2xl font-bold text-${statusColor}-600`}>{progress}%</div>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{committee.name}</h3>
                  <p className="text-sm text-gray-600 mb-3">Lead: {committee.lead}</p>
                  
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div className={`bg-${meta.color}-600 h-2 rounded-full`} style={{ width: `${progress}%` }}></div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <div className="font-bold text-green-600">{meta.tasks.completed}</div>
                      <div className="text-gray-500">Done</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-yellow-600">{meta.tasks.pending}</div>
                      <div className="text-gray-500">Pending</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-red-600">{meta.tasks.blocked}</div>
                      <div className="text-gray-500">Blocked</div>
                    </div>
                  </div>
                  
                  <div className="mt-3 text-xs text-gray-500 flex items-center">
                    <Users className="h-3 w-3 mr-1" />
                    {committee.members.length} members
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
