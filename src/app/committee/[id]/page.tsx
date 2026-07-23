'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Upload, MessageSquare, Trash2, X, Send, Loader2, AlertCircle, Users2, Search, UserPlus, Table2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Committee, Profile, CommitteeRole } from '@/lib/rbac';

type Task = {
  id: string;
  title: string;
  assigneeId: string | null;
  status: string;
  priority: string;
  dueDate: string;
};

type CommitteeFile = {
  id: string;
  fileName: string;
  fileSizeBytes: number | null;
  storagePath: string;
  uploadedByName: string;
  createdAt: string;
};

type ChatMessage = {
  id: string;
  body: string;
  senderName: string;
  createdAt: string;
};

const mapTaskRow = (row: {
  id: string;
  title: string;
  assignee_id: string | null;
  status: string;
  priority: string;
  due_date: string | null;
}): Task => ({
  id: row.id,
  title: row.title,
  assigneeId: row.assignee_id,
  status: row.status,
  priority: row.priority,
  dueDate: row.due_date ?? '',
});

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

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const STATUS_ORDER = ['todo', 'in_progress', 'review', 'blocked', 'done'];
const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
};

// Classifies a task's due date relative to today. Only "open" tasks (not done)
// can be overdue/due-soon — a completed task past its date isn't a problem.
function dueState(dueDate: string, status: string): 'overdue' | 'soon' | 'none' {
  if (!dueDate || status === 'done') return 'none';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 2) return 'soon';
  return 'none';
}

export default function CommitteeTaskBoard() {
  const params = useParams();
  const committeeId = (params.id as string) ?? '';
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, isCommitteeHead } = useAuth();

  const [committee, setCommittee] = useState<Committee | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [memberRoles, setMemberRoles] = useState<Record<string, CommitteeRole>>({});
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [accessDenied, setAccessDenied] = useState(false);

  const [showMembers, setShowMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);

  // Task board toolbar: search / filters / sort / grouping.
  const [taskSearch, setTaskSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all'); // 'all' | 'mine' | userId
  const [sortBy, setSortBy] = useState<'created' | 'due' | 'priority'>('created');
  const [groupByStatus, setGroupByStatus] = useState(false);

  const [showFiles, setShowFiles] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [files, setFiles] = useState<CommitteeFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');

  const isHead = isCommitteeHead(committeeId);

  const loadEverything = useCallback(async () => {
    if (!committeeId || !user) return;
    setIsLoading(true);
    setLoadError(null);
    setAccessDenied(false);

    const { data: committeeRow, error: committeeError } = await supabase.from('committees').select('*').eq('id', committeeId).single();
    if (committeeError || !committeeRow) {
      setAccessDenied(true);
      setIsLoading(false);
      return;
    }
    setCommittee(committeeRow);

    const { data: memberRows } = await supabase.from('committee_members').select('user_id, role').eq('committee_id', committeeId);
    const memberIds = (memberRows ?? []).map(m => m.user_id);
    const roleByUser: Record<string, CommitteeRole> = {};
    for (const m of memberRows ?? []) roleByUser[m.user_id] = m.role as CommitteeRole;
    setMemberRoles(roleByUser);

    let committeeProfiles: Profile[] = [];
    if (memberIds.length > 0) {
      const { data: profileRows } = await supabase.from('profiles').select('id, email, full_name, avatar_url, system_role').in('id', memberIds);
      committeeProfiles = profileRows ?? [];
    }
    setMembers(committeeProfiles);

    // Heads/admins can add anyone who has signed in, so load the full directory
    // for the typeahead. Volunteers don't manage membership, so skip it for them.
    if (isHead) {
      const { data: everyone } = await supabase.from('profiles').select('id, email, full_name, avatar_url, system_role').order('full_name');
      setAllProfiles(everyone ?? []);
    }

    const [{ data: taskRows, error: taskError }, { data: fileRows }, { data: messageRows }] = await Promise.all([
      supabase.from('tasks').select('id, title, assignee_id, status, priority, due_date').eq('committee_id', committeeId).order('created_at', { ascending: true }),
      supabase.from('committee_files').select('id, file_name, file_size_bytes, storage_path, uploaded_by, created_at').eq('committee_id', committeeId).order('created_at', { ascending: false }),
      supabase.from('committee_messages').select('id, body, user_id, created_at').eq('committee_id', committeeId).order('created_at', { ascending: true }),
    ]);

    if (taskError) {
      setLoadError('Could not load tasks. You may not have access to this committee.');
    } else {
      setTasks((taskRows ?? []).map(mapTaskRow));
    }

    const nameFor = (userId: string | null) => {
      if (!userId) return 'Unknown';
      if (userId === profile?.id) return profile.full_name || profile.email;
      const match = committeeProfiles.find(p => p.id === userId);
      return match?.full_name || match?.email || 'Unknown';
    };

    setFiles(
      (fileRows ?? []).map(f => ({
        id: f.id,
        fileName: f.file_name,
        fileSizeBytes: f.file_size_bytes,
        storagePath: f.storage_path,
        uploadedByName: nameFor(f.uploaded_by),
        createdAt: new Date(f.created_at).toLocaleString(),
      }))
    );

    setMessages(
      (messageRows ?? []).map(m => ({
        id: m.id,
        body: m.body,
        senderName: nameFor(m.user_id),
        createdAt: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }))
    );

    setIsLoading(false);
  }, [committeeId, user, supabase, profile, isHead]);

  useEffect(() => {
    loadEverything();
  }, [loadEverything]);

  // Live updates so heads/admins see task changes without asking anyone.
  useEffect(() => {
    if (!committeeId) return;
    const channel = supabase
      .channel(`committee-${committeeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `committee_id=eq.${committeeId}` }, loadEverything)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'committee_members', filter: `committee_id=eq.${committeeId}` }, loadEverything)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'committee_messages', filter: `committee_id=eq.${committeeId}` }, loadEverything)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [committeeId, supabase, loadEverything]);

  const memberName = (userId: string | null) => {
    if (!userId) return 'Unassigned';
    if (userId === profile?.id) return profile.full_name || profile.email;
    return members.find(m => m.id === userId)?.full_name || members.find(m => m.id === userId)?.email || 'Unknown';
  };

  const updateTask = async (id: string, field: 'title' | 'assigneeId' | 'status' | 'priority' | 'dueDate', value: string) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, [field]: value } : t)));
    const dbField = { title: 'title', assigneeId: 'assignee_id', status: 'status', priority: 'priority', dueDate: 'due_date' }[field];
    const { error } = await supabase.from('tasks').update({ [dbField]: value || null }).eq('id', id);
    if (error) {
      setLoadError('That change was not saved — you may not have permission to edit this field.');
      loadEverything();
    }
  };

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    const { data, error } = await supabase
      .from('tasks')
      .insert({ committee_id: committeeId, title: newTaskTitle.trim(), status: 'todo', priority: 'medium', created_by: profile?.id })
      .select('id, title, assignee_id, status, priority, due_date')
      .single();
    if (!error && data) {
      setTasks(prev => [...prev, mapTaskRow(data)]);
      setNewTaskTitle('');
      setShowAddTask(false);
    }
  };

  const deleteTask = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !profile) return;
    setIsUploading(true);
    for (const file of Array.from(e.target.files)) {
      const storagePath = `${committeeId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('committee-files').upload(storagePath, file);
      if (!uploadError) {
        await supabase.from('committee_files').insert({
          committee_id: committeeId,
          uploaded_by: profile.id,
          storage_path: storagePath,
          file_name: file.name,
          file_size_bytes: file.size,
        });
      }
    }
    setIsUploading(false);
    e.target.value = '';
    loadEverything();
  };

  const downloadFile = async (f: CommitteeFile) => {
    const { data } = await supabase.storage.from('committee-files').createSignedUrl(f.storagePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const deleteFile = async (f: CommitteeFile) => {
    setFiles(prev => prev.filter(x => x.id !== f.id));
    await supabase.storage.from('committee-files').remove([f.storagePath]);
    await supabase.from('committee_files').delete().eq('id', f.id);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !profile) return;
    const body = newMessage.trim();
    setNewMessage('');
    await supabase.from('committee_messages').insert({ committee_id: committeeId, user_id: profile.id, body });
    loadEverything();
  };

  const addMember = async (userId: string, role: CommitteeRole = 'volunteer') => {
    const { error } = await supabase.from('committee_members').insert({ committee_id: committeeId, user_id: userId, role });
    if (error) {
      setLoadError('Could not add that person — you may not have permission.');
      return;
    }
    setMemberSearch('');
    loadEverything();
  };

  const changeMemberRole = async (userId: string, role: CommitteeRole) => {
    setMemberRoles(prev => ({ ...prev, [userId]: role }));
    const { error } = await supabase.from('committee_members').update({ role }).eq('committee_id', committeeId).eq('user_id', userId);
    if (error) {
      setLoadError('Could not change that role.');
      loadEverything();
    }
  };

  const removeMember = async (userId: string) => {
    setMembers(prev => prev.filter(m => m.id !== userId));
    const { error } = await supabase.from('committee_members').delete().eq('committee_id', committeeId).eq('user_id', userId);
    if (error) {
      setLoadError('Could not remove that person.');
    }
    loadEverything();
  };

  const memberIdSet = new Set(members.map(m => m.id));
  const searchResults = memberSearch.trim()
    ? allProfiles
        .filter(p => !memberIdSet.has(p.id))
        .filter(p => {
          const q = memberSearch.toLowerCase();
          return (p.full_name?.toLowerCase().includes(q) ?? false) || p.email.toLowerCase().includes(q);
        })
        .slice(0, 6)
    : [];

  const overdueCount = tasks.filter(t => dueState(t.dueDate, t.status) === 'overdue').length;
  const stats = {
    total: tasks.length,
    done: tasks.filter(t => t.status === 'done').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    blocked: tasks.filter(t => t.status === 'blocked').length,
    overdue: overdueCount,
  };

  // Apply toolbar: search text → status filter → assignee filter → sort.
  const visibleTasks = tasks
    .filter(t => {
      if (!taskSearch.trim()) return true;
      return t.title.toLowerCase().includes(taskSearch.toLowerCase());
    })
    .filter(t => statusFilter === 'all' || t.status === statusFilter)
    .filter(t => {
      if (assigneeFilter === 'all') return true;
      if (assigneeFilter === 'mine') return t.assigneeId === profile?.id;
      if (assigneeFilter === 'unassigned') return !t.assigneeId;
      return t.assigneeId === assigneeFilter;
    })
    .sort((a, b) => {
      if (sortBy === 'due') {
        // Tasks with no due date sort to the bottom.
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (sortBy === 'priority') {
        return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      }
      return 0; // 'created' — preserve the load order (already created_at asc)
    });

  const isFiltering = taskSearch.trim() !== '' || statusFilter !== 'all' || assigneeFilter !== 'all';

  // When grouping, bucket the already-filtered/sorted tasks by status.
  const groupedTasks = STATUS_ORDER
    .map(status => ({ status, items: visibleTasks.filter(t => t.status === status) }))
    .filter(g => g.items.length > 0);

  // One task row, responsive: 12-col grid on desktop, stacked card on mobile.
  const renderTaskRow = (task: Task) => {
    const isOwnTask = task.assigneeId === profile?.id;
    const canEditFull = isHead;
    const canEditStatus = isHead || isOwnTask;
    const due = dueState(task.dueDate, task.status);
    const dueClass = due === 'overdue' ? 'text-red-600 font-semibold' : due === 'soon' ? 'text-orange-600 font-medium' : 'text-gray-500';

    return (
      <div key={task.id} className="flex flex-col gap-2 md:grid md:grid-cols-12 md:gap-2 px-4 py-3 hover:bg-gray-50 md:items-center">
        {/* Title */}
        <div className="md:col-span-4">
          {canEditFull ? (
            <input type="text" value={task.title} onChange={e => updateTask(task.id, 'title', e.target.value)} className="w-full px-2 py-1 border border-transparent hover:border-gray-200 rounded focus:outline-none focus:border-indigo-400 text-sm font-medium md:font-normal" />
          ) : (
            <p className="px-2 py-1 text-sm font-medium md:font-normal text-gray-900">{task.title}</p>
          )}
        </div>
        {/* Assignee */}
        <div className="md:col-span-2 flex items-center gap-2">
          <span className="md:hidden text-xs text-gray-400 w-16 shrink-0">Assignee</span>
          {canEditFull ? (
            <select value={task.assigneeId ?? ''} onChange={e => updateTask(task.id, 'assigneeId', e.target.value)} className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-indigo-400">
              <option value="">Unassigned</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
              ))}
            </select>
          ) : (
            <p className="px-2 py-1 text-sm text-gray-600">{memberName(task.assigneeId)}</p>
          )}
        </div>
        {/* Status */}
        <div className="md:col-span-2 flex items-center gap-2">
          <span className="md:hidden text-xs text-gray-400 w-16 shrink-0">Status</span>
          <select
            value={task.status}
            onChange={e => updateTask(task.id, 'status', e.target.value)}
            disabled={!canEditStatus}
            className={`w-full px-2 py-1 border rounded text-xs font-medium disabled:opacity-60 ${statusStyle[task.status] ?? ''}`}
          >
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        {/* Priority */}
        <div className="md:col-span-1 flex items-center gap-2">
          <span className="md:hidden text-xs text-gray-400 w-16 shrink-0">Priority</span>
          {canEditFull ? (
            <select value={task.priority} onChange={e => updateTask(task.id, 'priority', e.target.value)} className={`w-full px-1 py-1 border rounded text-xs font-medium ${priorityStyle[task.priority] ?? ''}`}>
              <option value="low">Low</option>
              <option value="medium">Med</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          ) : (
            <span className={`inline-block px-1.5 py-1 rounded text-xs font-medium ${priorityStyle[task.priority] ?? ''}`}>{task.priority}</span>
          )}
        </div>
        {/* Due date */}
        <div className="md:col-span-2 flex items-center gap-2">
          <span className="md:hidden text-xs text-gray-400 w-16 shrink-0">Due</span>
          {canEditFull ? (
            <div className="flex items-center gap-1 w-full">
              <input type="date" value={task.dueDate} onChange={e => updateTask(task.id, 'dueDate', e.target.value)} className={`w-full px-2 py-1 border rounded text-sm focus:outline-none focus:border-indigo-400 ${due === 'overdue' ? 'border-red-300 text-red-600' : 'border-gray-200'}`} />
              {due === 'overdue' && <span title="Overdue"><AlertCircle className="h-4 w-4 text-red-500 shrink-0" /></span>}
            </div>
          ) : (
            <p className={`px-2 py-1 text-sm ${dueClass}`}>
              {task.dueDate || '—'}{due === 'overdue' && ' · overdue'}{due === 'soon' && ' · soon'}
            </p>
          )}
        </div>
        {/* Delete */}
        <div className="md:col-span-1 flex md:justify-center">
          {canEditFull && (
            <button onClick={() => deleteTask(task.id)} className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (accessDenied || !committee) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-600">You don&apos;t have access to this committee, or it doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{committee.name}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {members.length} member{members.length !== 1 ? 's' : ''} {isHead && <span className="text-indigo-600 font-medium">· You are Head</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {isHead && (
              <button onClick={() => { setShowMembers(!showMembers); setShowFiles(false); setShowChat(false); }} className={`px-4 py-2 rounded-lg flex items-center gap-2 border text-sm font-medium transition-colors ${showMembers ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                <Users2 className="h-4 w-4" /> Members {members.length > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full ${showMembers ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800'}`}>{members.length}</span>}
              </button>
            )}
            <Link href={`/committee/${committeeId}/lists`} className="px-4 py-2 rounded-lg flex items-center gap-2 border text-sm font-medium transition-colors bg-white text-gray-700 border-gray-300 hover:bg-gray-50">
              <Table2 className="h-4 w-4" /> Lists
            </Link>
            <button onClick={() => { setShowFiles(!showFiles); setShowChat(false); setShowMembers(false); }} className={`px-4 py-2 rounded-lg flex items-center gap-2 border text-sm font-medium transition-colors ${showFiles ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
              <Upload className="h-4 w-4" /> Files {files.length > 0 && <span className="bg-indigo-100 text-indigo-800 text-xs px-1.5 py-0.5 rounded-full">{files.length}</span>}
            </button>
            <button onClick={() => { setShowChat(!showChat); setShowFiles(false); setShowMembers(false); }} className={`px-4 py-2 rounded-lg flex items-center gap-2 border text-sm font-medium transition-colors ${showChat ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
              <MessageSquare className="h-4 w-4" /> Chat {messages.length > 0 && <span className="bg-purple-100 text-purple-800 text-xs px-1.5 py-0.5 rounded-full">{messages.length}</span>}
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{loadError}</div>
        )}

        {/* No-members hint — explains why the assignee dropdown is empty. */}
        {isHead && members.length === 0 && !showMembers && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-4">
            <div className="flex items-start gap-2 text-sm text-amber-800">
              <Users2 className="h-5 w-5 shrink-0 mt-0.5" />
              <span>This committee has no members yet, so tasks can&apos;t be assigned to anyone. Add people to fill the assignee list.</span>
            </div>
            <button
              onClick={() => { setShowMembers(true); setShowFiles(false); setShowChat(false); }}
              className="shrink-0 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
            >
              Add members
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[{ label: 'Total', val: stats.total, color: 'text-gray-900' }, { label: 'Completed', val: stats.done, color: 'text-green-600' }, { label: 'In Progress', val: stats.inProgress, color: 'text-blue-600' }, { label: 'Blocked', val: stats.blocked, color: 'text-red-600' }, { label: 'Overdue', val: stats.overdue, color: 'text-orange-600' }].map(s => (
            <div key={s.label} className="bg-white rounded-lg p-4 shadow-sm text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-sm text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-lg shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={taskSearch}
              onChange={e => setTaskSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>
          <button
            onClick={() => setAssigneeFilter(assigneeFilter === 'mine' ? 'all' : 'mine')}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${assigneeFilter === 'mine' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            My Tasks
          </button>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-400">
            <option value="all">All statuses</option>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-400 max-w-[160px]">
            <option value="all">Everyone</option>
            <option value="mine">My tasks</option>
            <option value="unassigned">Unassigned</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-400">
            <option value="created">Sort: Default</option>
            <option value="due">Sort: Due date</option>
            <option value="priority">Sort: Priority</option>
          </select>
          <button
            onClick={() => setGroupByStatus(!groupByStatus)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${groupByStatus ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            Group by status
          </button>
        </div>

        <div className="flex gap-4">
          {/* Task Board */}
          <div className="flex-1 bg-white rounded-lg shadow overflow-hidden">
            {/* Column header — desktop only */}
            <div className="hidden md:grid bg-slate-800 grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wide">
              <div className="col-span-4">Task</div>
              <div className="col-span-2">Assignee</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Priority</div>
              <div className="col-span-2">Due Date</div>
              <div className="col-span-1"></div>
            </div>
            <div className="divide-y divide-gray-100">
              {tasks.length === 0 && !showAddTask && (
                <div className="px-4 py-10 text-center text-sm text-gray-400">
                  No tasks yet. {isHead && <>Click <span className="font-medium text-indigo-600">+ Add Task</span> to get started.</>}
                </div>
              )}
              {tasks.length > 0 && visibleTasks.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-gray-400">
                  No tasks match your filters. {isFiltering && <button onClick={() => { setTaskSearch(''); setStatusFilter('all'); setAssigneeFilter('all'); }} className="text-indigo-600 hover:text-indigo-700 font-medium">Clear filters</button>}
                </div>
              )}

              {groupByStatus
                ? groupedTasks.map(group => (
                    <div key={group.status}>
                      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50/80 sticky top-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusStyle[group.status] ?? ''}`}>{STATUS_LABEL[group.status]}</span>
                        <span className="text-xs text-gray-400">{group.items.length}</span>
                      </div>
                      {group.items.map(renderTaskRow)}
                    </div>
                  ))
                : visibleTasks.map(renderTaskRow)}

              {isHead && (showAddTask ? (
                <div className="flex flex-col md:grid md:grid-cols-12 gap-2 px-4 py-3 bg-indigo-50 md:items-center">
                  <div className="md:col-span-5">
                    <input type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="Enter task title..." autoFocus className="w-full px-3 py-1.5 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="md:col-span-7 flex gap-2">
                    <button onClick={addTask} className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">Save</button>
                    <button onClick={() => { setShowAddTask(false); setNewTaskTitle(''); }} className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3">
                  <button onClick={() => setShowAddTask(true)} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                    <Plus className="h-4 w-4" /> Add Task
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Members Panel */}
          {showMembers && isHead && (
            <div className="w-80 bg-white rounded-lg shadow flex flex-col" style={{ maxHeight: '560px' }}>
              <div className="flex items-center justify-between px-4 py-3 bg-slate-800 rounded-t-lg">
                <h3 className="font-semibold text-white">Members</h3>
                <button onClick={() => setShowMembers(false)}><X className="h-4 w-4 text-slate-300 hover:text-white" /></button>
              </div>

              {/* Add-member typeahead */}
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Search people by name or email..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  />
                </div>
                {memberSearch.trim() && (
                  <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-100 overflow-hidden">
                    {searchResults.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">No matching people not already in this committee.</p>
                    ) : (
                      searchResults.map(p => (
                        <button
                          key={p.id}
                          onClick={() => addMember(p.id, 'volunteer')}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-emerald-50 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{p.full_name || p.email}</p>
                            {p.full_name && <p className="text-xs text-gray-400 truncate">{p.email}</p>}
                          </div>
                          <UserPlus className="h-4 w-4 text-emerald-600 shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Current members */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {members.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center mt-6">No members yet. Search above to add people.</p>
                ) : (
                  members.map(m => {
                    const role = memberRoles[m.id] ?? 'volunteer';
                    const isSelf = m.id === profile?.id;
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg p-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{m.full_name || m.email}</p>
                          {m.full_name && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <select
                            value={role}
                            onChange={e => changeMemberRole(m.id, e.target.value as CommitteeRole)}
                            className="px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:border-emerald-400"
                          >
                            <option value="volunteer">Volunteer</option>
                            <option value="head">Head</option>
                          </select>
                          <button
                            onClick={() => removeMember(m.id)}
                            disabled={isSelf}
                            title={isSelf ? "You can't remove yourself" : 'Remove from committee'}
                            className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Files Panel */}
          {showFiles && (
            <div className="w-72 bg-white rounded-lg shadow flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-800 rounded-t-lg">
                <h3 className="font-semibold text-white">Files</h3>
                <button onClick={() => setShowFiles(false)}><X className="h-4 w-4 text-slate-300 hover:text-white" /></button>
              </div>
              <div className="p-3 border-b">
                <label className="cursor-pointer block">
                  <div className="border-2 border-dashed border-indigo-200 rounded-lg p-4 text-center hover:bg-indigo-50 transition-colors">
                    <Upload className="h-6 w-6 text-indigo-400 mx-auto mb-1" />
                    <p className="text-sm text-indigo-600 font-medium">{isUploading ? 'Uploading...' : 'Upload files'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Any format</p>
                  </div>
                  <input type="file" multiple className="hidden" onChange={handleUpload} disabled={isUploading} />
                </label>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {files.length === 0
                  ? <p className="text-xs text-gray-400 text-center mt-6">No files yet</p>
                  : files.map(f => (
                    <div key={f.id} className="flex items-start justify-between bg-gray-50 rounded p-2 gap-2">
                      <button className="flex-1 min-w-0 text-left" onClick={() => downloadFile(f)}>
                        <p className="text-xs font-medium text-gray-900 truncate hover:text-indigo-600">{f.fileName}</p>
                        <p className="text-xs text-gray-400">{formatBytes(f.fileSizeBytes)} · {f.uploadedByName}</p>
                        <p className="text-xs text-gray-300">{f.createdAt}</p>
                      </button>
                      <button onClick={() => deleteFile(f)} className="text-gray-300 hover:text-red-400 mt-0.5"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Chat Panel */}
          {showChat && (
            <div className="w-72 bg-white rounded-lg shadow flex flex-col" style={{ height: '520px' }}>
              <div className="flex items-center justify-between px-4 py-3 bg-slate-800 rounded-t-lg">
                <h3 className="font-semibold text-white">Team Discussion</h3>
                <button onClick={() => setShowChat(false)}><X className="h-4 w-4 text-slate-300 hover:text-white" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0
                  ? <p className="text-xs text-gray-400 text-center mt-6">No messages yet. Start the conversation!</p>
                  : messages.map(m => (
                    <div key={m.id}>
                      <div className="flex items-baseline gap-1 mb-0.5">
                        <span className="text-xs font-semibold text-purple-700">{m.senderName}</span>
                        <span className="text-xs text-gray-400">{m.createdAt}</span>
                      </div>
                      <div className="bg-purple-50 rounded-lg px-3 py-2 text-sm text-gray-800 break-words">{m.body}</div>
                    </div>
                  ))}
              </div>
              <div className="p-3 border-t flex gap-2">
                <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Type a message..." className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-400" />
                <button onClick={sendMessage} className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
