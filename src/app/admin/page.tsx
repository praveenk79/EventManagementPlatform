'use client';

import { useState, useEffect, useMemo } from 'react';
import { Users, CheckSquare, AlertCircle, TrendingUp, Calendar, Plane, Utensils, Hotel, Music, Award, Megaphone, Globe, Palette, DollarSign, UserCheck, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Committee, Profile } from '@/lib/rbac';
import AdminNav from '@/components/AdminNav';

interface CommitteeMeta {
  icon: LucideIcon;
  color: string;
}

interface TaskStats {
  total: number;
  completed: number;
  pending: number;
  blocked: number;
}

const EMPTY_STATS: TaskStats = { total: 0, completed: 0, pending: 0, blocked: 0 };
const DEFAULT_META: CommitteeMeta = { icon: Users, color: 'gray' };

// Icon/color metadata, keyed by committee slug. Falls back to DEFAULT_META
// for any committee created after this list was written.
const COMMITTEE_METADATA: Record<string, CommitteeMeta> = {
  'committee_youth': { icon: Users, color: 'blue' },
  'committee_awards': { icon: Award, color: 'yellow' },
  'committee_speakers': { icon: Megaphone, color: 'purple' },
  'committee_registration': { icon: UserCheck, color: 'green' },
  'committee_website': { icon: Globe, color: 'indigo' },
  'committee_flyer': { icon: Palette, color: 'pink' },
  'committee_sponsors': { icon: DollarSign, color: 'emerald' },
  'committee_hotel': { icon: Hotel, color: 'cyan' },
  'committee_food': { icon: Utensils, color: 'orange' },
  'committee_travel': { icon: Plane, color: 'sky' },
  'committee_entertainment': { icon: Music, color: 'violet' },
  'committee_executive': { icon: Calendar, color: 'rose' },
};

// Same status grouping used on the committee task board (src/app/committee/[id]/page.tsx)
function statsFromStatuses(statuses: string[]): TaskStats {
  return statuses.reduce((acc, status) => {
    acc.total += 1;
    if (status === 'done') acc.completed += 1;
    else if (status === 'blocked') acc.blocked += 1;
    else acc.pending += 1; // todo, in_progress, review
    return acc;
  }, { total: 0, completed: 0, pending: 0, blocked: 0 } as TaskStats);
}

export default function AdminDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [headByCommittee, setHeadByCommittee] = useState<Record<string, Profile | undefined>>({});
  const [taskStatsByCommittee, setTaskStatsByCommittee] = useState<Record<string, TaskStats>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const { data: committeeRows } = await supabase.from('committees').select('*').eq('archived', false).order('name');
      const activeCommittees = committeeRows ?? [];
      setCommittees(activeCommittees);

      if (activeCommittees.length === 0) {
        setIsLoading(false);
        return;
      }

      const committeeIds = activeCommittees.map(c => c.id);

      const [{ data: taskRows }, { data: memberRows }, { data: profileRows }] = await Promise.all([
        // Single batched query for all committees, avoids N+1 queries.
        supabase.from('tasks').select('committee_id, status').in('committee_id', committeeIds),
        supabase.from('committee_members').select('committee_id, role, user_id').in('committee_id', committeeIds),
        supabase.from('profiles').select('id, email, full_name, avatar_url, system_role'),
      ]);

      const groupedStatuses: Record<string, string[]> = {};
      for (const row of taskRows ?? []) {
        (groupedStatuses[row.committee_id] ??= []).push(row.status);
      }
      const stats: Record<string, TaskStats> = {};
      for (const id of committeeIds) {
        stats[id] = statsFromStatuses(groupedStatuses[id] ?? []);
      }
      setTaskStatsByCommittee(stats);

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

      setIsLoading(false);
    };
    load();
  }, [supabase]);

  const getCommitteeStats = (id: string): TaskStats => taskStatsByCommittee[id] ?? EMPTY_STATS;

  const getCommitteeProgress = (id: string) => {
    const stats = getCommitteeStats(id);
    if (stats.total === 0) return 0;
    return Math.round((stats.completed / stats.total) * 100);
  };

  const allStats = committees.map(c => getCommitteeStats(c.id));
  const totalTasks = allStats.reduce((sum, s) => sum + s.total, 0);
  const completedTasks = allStats.reduce((sum, s) => sum + s.completed, 0);
  const pendingTasks = allStats.reduce((sum, s) => sum + s.pending, 0);
  const blockedTasks = allStats.reduce((sum, s) => sum + s.blocked, 0);
  const overallProgress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-7xl">
        <AdminNav />
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Single pane of glass - All committees at a glance</p>
        </div>

        {/* Overall Stats — task cards drill into the All Tasks view */}
        <div className="grid md:grid-cols-5 gap-4 mb-8">
          <Link href="/admin-tasks" className="bg-white rounded-lg shadow p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-indigo-600">{overallProgress}%</div>
              <TrendingUp className="h-8 w-8 text-indigo-600" />
            </div>
            <div className="text-gray-600 text-sm">Overall Progress</div>
          </Link>
          <Link href="/admin-tasks?filter=done" className="bg-white rounded-lg shadow p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-green-600">{completedTasks}</div>
              <CheckSquare className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-gray-600 text-sm">Completed Tasks</div>
          </Link>
          <Link href="/admin-tasks?filter=pending" className="bg-white rounded-lg shadow p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-yellow-600">{pendingTasks}</div>
              <AlertCircle className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="text-gray-600 text-sm">Pending Tasks</div>
          </Link>
          <Link href="/admin-tasks?filter=blocked" className="bg-white rounded-lg shadow p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-red-600">{blockedTasks}</div>
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <div className="text-gray-600 text-sm">Blocked Tasks</div>
          </Link>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-purple-600">{committees.length}</div>
              <Users className="h-8 w-8 text-purple-600" />
            </div>
            <div className="text-gray-600 text-sm">Active Committees</div>
          </div>
        </div>

        {/* All Committees Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">All Committees Status</h2>
          {committees.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-10 text-center text-gray-400">
              No committees yet.{' '}
              <Link href="/admin-committees" className="text-indigo-600 hover:text-indigo-700 font-medium">
                Create one
              </Link>
              .
            </div>
          ) : (
            <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
              {committees.map(committee => {
                const meta = COMMITTEE_METADATA[committee.slug] ?? DEFAULT_META;
                const stats = getCommitteeStats(committee.id);
                const Icon = meta.icon;
                const progress = getCommitteeProgress(committee.id);
                const statusColor = stats.total === 0 ? 'gray' : progress === 100 ? 'green' : progress >= 70 ? 'blue' : progress >= 40 ? 'yellow' : 'red';
                const head = headByCommittee[committee.id];

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
                    <p className="text-sm text-gray-600 mb-3">Head: {head?.full_name || head?.email || 'Unassigned'}</p>

                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                      <div className={`bg-${meta.color}-600 h-2 rounded-full`} style={{ width: `${progress}%` }}></div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <div className="font-bold text-green-600">{stats.completed}</div>
                        <div className="text-gray-500">Done</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-yellow-600">{stats.pending}</div>
                        <div className="text-gray-500">Pending</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-red-600">{stats.blocked}</div>
                        <div className="text-gray-500">Blocked</div>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-gray-500 flex items-center">
                      <Users className="h-3 w-3 mr-1" />
                      {memberCounts[committee.id] ?? 0} members
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
