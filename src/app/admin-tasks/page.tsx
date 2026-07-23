'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Search, ArrowRight, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AdminNav from '@/components/AdminNav';
import type { Committee, Profile } from '@/lib/rbac';
import { useRequireAdmin } from '@/lib/use-require-admin';

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  committee_id: string;
  assignee_id: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
};

const statusStyle: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  review: 'bg-yellow-100 text-yellow-800',
  done: 'bg-green-100 text-green-800',
  blocked: 'bg-red-100 text-red-800',
};

const priorityStyle: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

// "pending" on the dashboard = anything not done and not blocked (todo/in_progress/review).
const PENDING_STATUSES = ['todo', 'in_progress', 'review'];

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'done', label: 'Completed' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'overdue', label: 'Overdue' },
];

function isOverdue(due: string | null, status: string): boolean {
  if (!due || status === 'done') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(due + 'T00:00:00').getTime() < today.getTime();
}

function AdminTasksInner() {
  const { allowed, checking } = useRequireAdmin();
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get('filter') ?? 'all';

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [committees, setCommittees] = useState<Record<string, Committee>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState('');
  const [committeeFilter, setCommitteeFilter] = useState('all');

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data: taskRows }, { data: committeeRows }, { data: profileRows }] = await Promise.all([
      supabase.from('tasks').select('id, title, status, priority, due_date, committee_id, assignee_id'),
      supabase.from('committees').select('*'),
      supabase.from('profiles').select('id, email, full_name, avatar_url, system_role'),
    ]);
    setTasks((taskRows ?? []) as TaskRow[]);
    setCommittees(Object.fromEntries((committeeRows ?? []).map(c => [c.id, c])));
    setProfiles(Object.fromEntries((profileRows ?? []).map(p => [p.id, p])));
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const filtered = tasks
    .filter(t => {
      if (filter === 'all') return true;
      if (filter === 'pending') return PENDING_STATUSES.includes(t.status);
      if (filter === 'done') return t.status === 'done';
      if (filter === 'blocked') return t.status === 'blocked';
      if (filter === 'overdue') return isOverdue(t.due_date, t.status);
      return true;
    })
    .filter(t => committeeFilter === 'all' || t.committee_id === committeeFilter)
    .filter(t => !search.trim() || t.title.toLowerCase().includes(search.toLowerCase()));

  const activeCommittees = Object.values(committees).filter(c => !c.archived).sort((a, b) => a.name.localeCompare(b.name));

  if (checking || !allowed || isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <AdminNav />

        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-900">All Tasks</h1>
          <p className="text-gray-600 mt-2">Every task across all committees, in one place.</p>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {FILTERS.map(f => {
            const count = tasks.filter(t => {
              if (f.key === 'all') return true;
              if (f.key === 'pending') return PENDING_STATUSES.includes(t.status);
              if (f.key === 'done') return t.status === 'done';
              if (f.key === 'blocked') return t.status === 'blocked';
              if (f.key === 'overdue') return isOverdue(t.due_date, t.status);
              return false;
            }).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${filter === f.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
              >
                {f.label} <span className={filter === f.key ? 'text-indigo-200' : 'text-gray-400'}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search + committee filter */}
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <select value={committeeFilter} onChange={e => setCommitteeFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-400">
            <option value="all">All committees</option>
            {activeCommittees.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-800 text-slate-200 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Task</th>
                <th className="text-left px-4 py-3 font-semibold">Committee</th>
                <th className="text-left px-4 py-3 font-semibold">Assignee</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Priority</th>
                <th className="text-left px-4 py-3 font-semibold">Due</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">No tasks match this view.</td></tr>
              ) : filtered.map(t => {
                const committee = committees[t.committee_id];
                const assignee = t.assignee_id ? profiles[t.assignee_id] : null;
                const overdue = isOverdue(t.due_date, t.status);
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{committee?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{assignee?.full_name || assignee?.email || <span className="text-gray-400">Unassigned</span>}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-medium ${statusStyle[t.status] ?? ''}`}>{STATUS_LABEL[t.status] ?? t.status}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-medium ${priorityStyle[t.priority] ?? ''}`}>{t.priority}</span></td>
                    <td className="px-4 py-3 text-sm">
                      {t.due_date
                        ? <span className={overdue ? 'text-red-600 font-semibold inline-flex items-center gap-1' : 'text-gray-500'}>{overdue && <AlertCircle className="h-3.5 w-3.5" />}{t.due_date}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {committee && (
                        <Link href={`/committee/${committee.id}`} className="text-indigo-600 hover:text-indigo-700 inline-flex" title="Open committee board">
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">{filtered.length} task{filtered.length !== 1 ? 's' : ''} shown</p>
      </div>
    </div>
  );
}

export default function AdminTasksPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}>
      <AdminTasksInner />
    </Suspense>
  );
}
