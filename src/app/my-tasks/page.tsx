'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ListChecks, ClipboardList, Plus, Pencil, Check, X, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useEvent } from '@/lib/event-context';
import { getUserCommittees } from '@/lib/rbac';

// Mirrors the status styling in committee/[id]/page.tsx — same values, same
// colors, so a task looks the same here as it does on its committee page.
const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
];
const statusStyle: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  review: 'bg-yellow-100 text-yellow-800',
  done: 'bg-green-100 text-green-800',
  blocked: 'bg-red-100 text-red-800',
};

type AssignedTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  committeeName: string;
  eventName: string;
};

type Todo = {
  id: string;
  text: string;
  dueDate: string | null;
  done: boolean;
};

type TodoDraft = {
  text: string;
  dueDate: string;
};

const emptyDraft: TodoDraft = { text: '', dueDate: '' };

export default function MyTasksPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, committeeRoles, isAdmin, loading: authLoading } = useAuth();
  const { events } = useEvent();

  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [addDraft, setAddDraft] = useState<TodoDraft>(emptyDraft);
  const [isAdding, setIsAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TodoDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    const { data: committeeRows } = await supabase.from('committees').select('*').eq('archived', false);
    const committeeIds = getUserCommittees(committeeRows ?? [], committeeRoles, isAdmin).map(c => c.id);
    const committeeNameById = new Map((committeeRows ?? []).map(c => [c.id, c.name]));
    const committeeEventById = new Map((committeeRows ?? []).map(c => [c.id, c.event_id]));
    const eventNameById = new Map(events.map(e => [e.id, e.name]));

    const [{ data: taskRows }, { data: todoRows }] = await Promise.all([
      committeeIds.length > 0
        ? supabase
            .from('tasks')
            .select('id, title, status, due_date, committee_id')
            .in('committee_id', committeeIds)
            .eq('assignee_id', profile.id)
            .order('due_date', { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [] }),
      supabase.from('personal_todos').select('*').order('done').order('due_date', { ascending: true, nullsFirst: false }).order('created_at'),
    ]);

    setAssignedTasks(
      (taskRows ?? []).map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.due_date,
        committeeName: committeeNameById.get(t.committee_id) ?? 'Unknown committee',
        eventName: eventNameById.get(committeeEventById.get(t.committee_id) ?? '') ?? 'Unknown event',
      }))
    );
    setTodos((todoRows ?? []).map(t => ({ id: t.id, text: t.text, dueDate: t.due_date, done: t.done })));
    setIsLoading(false);
  }, [supabase, profile, committeeRoles, isAdmin, events]);

  useEffect(() => {
    if (authLoading || !user) return;
    load();
  }, [authLoading, user, load]);

  const updateTaskStatus = async (task: AssignedTask, status: string) => {
    const previous = assignedTasks;
    setAssignedTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status } : t)));
    const { error } = await supabase.from('tasks').update({ status }).eq('id', task.id);
    if (error) {
      setAssignedTasks(previous);
      toast.error('Could not update that task.');
      return;
    }
    toast.success('Saved');
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditDraft({ text: todo.text, dueDate: todo.dueDate ?? '' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyDraft);
  };

  const addTodo = async () => {
    if (!addDraft.text.trim() || !profile) return;
    setIsAdding(true);
    const { data, error } = await supabase
      .from('personal_todos')
      .insert({ user_id: profile.id, text: addDraft.text.trim(), due_date: addDraft.dueDate || null })
      .select('*')
      .single();
    setIsAdding(false);

    if (error || !data) {
      toast.error('Could not add that todo.');
      return;
    }
    setTodos(prev => [...prev, { id: data.id, text: data.text, dueDate: data.due_date, done: data.done }]);
    setAddDraft(emptyDraft);
    setShowAdd(false);
  };

  const saveEdit = async (todo: Todo) => {
    if (!editDraft.text.trim()) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('personal_todos')
      .update({ text: editDraft.text.trim(), due_date: editDraft.dueDate || null })
      .eq('id', todo.id);
    setIsSaving(false);

    if (error) {
      toast.error('Could not save that change.');
      return;
    }
    setTodos(prev =>
      prev.map(t => (t.id === todo.id ? { ...t, text: editDraft.text.trim(), dueDate: editDraft.dueDate || null } : t))
    );
    toast.success('Saved');
    cancelEdit();
  };

  const toggleDone = async (todo: Todo) => {
    const previous = todos;
    setTodos(prev => prev.map(t => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    const { error } = await supabase.from('personal_todos').update({ done: !todo.done }).eq('id', todo.id);
    if (error) {
      setTodos(previous);
      toast.error('Could not update that todo.');
    }
  };

  const deleteTodo = async (todo: Todo) => {
    const previous = todos;
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    const { error } = await supabase.from('personal_todos').delete().eq('id', todo.id);
    if (error) {
      setTodos(previous);
      toast.error('Could not delete that todo.');
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <ListChecks className="h-7 w-7 text-indigo-600" /> My Tasks
          </h1>
          <p className="text-gray-500 text-sm mt-1">What you owe today — committee tasks assigned to you, plus your own private todos.</p>
        </div>

        {/* Section 1 — assigned committee tasks (read from tasks, no new table) */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Assigned to you</h2>
          <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-100">
            {assignedTasks.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No committee tasks are assigned to you right now.</div>
            ) : (
              assignedTasks.map(task => (
                <div key={task.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {task.eventName} · {task.committeeName}
                      {task.dueDate && <> · Due {new Date(task.dueDate).toLocaleDateString()}</>}
                    </p>
                  </div>
                  <select
                    value={task.status}
                    onChange={e => updateTaskStatus(task, e.target.value)}
                    className={`shrink-0 px-2 py-1 border border-gray-200 rounded text-xs font-medium ${statusStyle[task.status] ?? ''}`}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section 2 — private personal todos */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-600" /> Your personal todos
          </h2>
          <p className="text-xs text-gray-400 mb-3">Only you can see these — not committee heads, not admins.</p>
          <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-100">
            {todos.length === 0 && !showAdd && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No personal todos yet.</div>
            )}

            {todos.map(todo => {
              const isEditing = editingId === todo.id;
              if (isEditing) {
                return (
                  <div key={todo.id} className="flex flex-col gap-2 sm:flex-row sm:items-center px-4 py-3 bg-indigo-50/60">
                    <input
                      type="text"
                      value={editDraft.text}
                      onChange={e => setEditDraft(d => ({ ...d, text: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(todo)}
                      autoFocus
                      className="flex-1 px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="date"
                      value={editDraft.dueDate}
                      onChange={e => setEditDraft(d => ({ ...d, dueDate: e.target.value }))}
                      className="px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => saveEdit(todo)} disabled={isSaving || !editDraft.text.trim()} title="Save" className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button onClick={cancelEdit} disabled={isSaving} title="Cancel" className="p-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => toggleDone(todo)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${todo.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{todo.text}</p>
                    {todo.dueDate && <p className="text-xs text-gray-400 mt-0.5">Due {new Date(todo.dueDate).toLocaleDateString()}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(todo)} title="Edit" className="p-1.5 hover:bg-indigo-50 rounded text-gray-500 hover:text-indigo-500 transition-colors">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteTodo(todo)} title="Delete" className="p-1.5 hover:bg-red-50 rounded text-gray-500 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {showAdd ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center px-4 py-3 bg-indigo-50">
                <input
                  type="text"
                  value={addDraft.text}
                  onChange={e => setAddDraft(d => ({ ...d, text: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addTodo()}
                  placeholder="What do you need to do?"
                  autoFocus
                  className="flex-1 px-2 py-1.5 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="date"
                  value={addDraft.dueDate}
                  onChange={e => setAddDraft(d => ({ ...d, dueDate: e.target.value }))}
                  className="px-2 py-1.5 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                />
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={addTodo}
                    disabled={isAdding || !addDraft.text.trim()}
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </button>
                  <button onClick={() => { setShowAdd(false); setAddDraft(emptyDraft); }} className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3">
                <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                  <Plus className="h-4 w-4" /> Add todo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
