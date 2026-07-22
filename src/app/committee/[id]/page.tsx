'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Upload, MessageSquare, Trash2, X, Send, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const committeeData: Record<string, { name: string; lead: string; members: string[] }> = {
  youth: { name: 'Youth Conference', lead: 'John Doe', members: ['John Doe', 'Sarah Smith', 'Mike Johnson', 'Emily Davis'] },
  awards: { name: 'Award Committee', lead: 'Sarah Smith', members: ['Sarah Smith', 'David Kim', 'Lisa Wang'] },
  speakers: { name: 'Speaker Coordination', lead: 'Mike Johnson', members: ['Mike Johnson', 'Anna Lee', 'David Kim', 'Lisa Wang', 'Tom Brown'] },
  registration: { name: 'Registration Committee', lead: 'Emily Davis', members: ['Emily Davis', 'Chris Chen', 'Amy Taylor', 'Rob Martinez'] },
  website: { name: 'Website Communications', lead: 'Alex Chen', members: ['Alex Chen', 'Maria Garcia', 'Tom Brown'] },
  flyer: { name: 'Flyer Design', lead: 'Maria Garcia', members: ['Maria Garcia', 'Alex Chen'] },
  sponsors: { name: 'Sponsor Coordination', lead: 'David Lee', members: ['David Lee', 'Anna Lee', 'Chris Chen', 'Rob Martinez'] },
  hotel: { name: 'Hotel & Accommodation', lead: 'Lisa Wang', members: ['Lisa Wang', 'Amy Taylor', 'Tom Brown'] },
  food: { name: 'Food Committee', lead: 'James Wilson', members: ['James Wilson', 'Maria Garcia', 'Chris Chen', 'Amy Taylor', 'Rob Martinez'] },
  travel: { name: 'Travel Arrangements', lead: 'Anna Martinez', members: ['Anna Martinez', 'Tom Brown', 'David Kim', 'Rob Martinez'] },
  entertainment: { name: 'Entertainment Group', lead: 'Chris Brown', members: ['Chris Brown', 'Amy Taylor', 'Maria Garcia'] },
  executive: { name: 'Executive Dinner', lead: 'Jennifer Taylor', members: ['Jennifer Taylor', 'David Lee', 'Lisa Wang'] },
};

type Task = {
  id: string;
  title: string;
  assignee: string;
  status: string;
  priority: string;
  dueDate: string;
};

const mapRow = (row: Record<string, string>): Task => ({
  id: row.id,
  title: row.title,
  assignee: row.assignee ?? '',
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

export default function CommitteeTaskBoard() {
  const params = useParams();
  const committeeId = (params.id as string) ?? 'youth';
  const committee = committeeData[committeeId] ?? committeeData['youth'];
  const supabase = createClient();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [files, setFiles] = useState<Array<{ id: number; name: string; size: string; by: string; at: string }>>([]);
  const [messages, setMessages] = useState<Array<{ id: number; text: string; sender: string; time: string }>>([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    const loadTasks = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('committee_id', committeeId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        setTasks((data ?? []).map(mapRow));
      } catch {
        const saved = localStorage.getItem('tasks_' + committeeId);
        setTasks(saved ? JSON.parse(saved) : []);
      } finally {
        setIsLoading(false);
      }
    };
    loadTasks();
    const savedFiles = localStorage.getItem('files_' + committeeId);
    if (savedFiles) setFiles(JSON.parse(savedFiles));
    const savedMsgs = localStorage.getItem('chat_' + committeeId);
    if (savedMsgs) setMessages(JSON.parse(savedMsgs));
  }, [committeeId]);

  const updateTask = async (id: string, field: string, value: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    const dbField = field === 'dueDate' ? 'due_date' : field;
    await supabase.from('tasks').update({ [dbField]: value || null, updated_at: new Date().toISOString() }).eq('id', id);
  };

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    const { data, error } = await supabase
      .from('tasks')
      .insert({ committee_id: committeeId, title: newTaskTitle.trim(), assignee: '', status: 'todo', priority: 'medium', due_date: null })
      .select()
      .single();
    if (!error && data) {
      setTasks(prev => [...prev, mapRow(data)]);
      setNewTaskTitle('');
      setShowAddTask(false);
    }
  };

  const deleteTask = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map(f => ({
      id: Date.now() + Math.random(),
      name: f.name,
      size: (f.size / 1024).toFixed(1) + ' KB',
      by: committee.lead,
      at: new Date().toLocaleString(),
    }));
    const updated = [...files, ...newFiles];
    setFiles(updated);
    localStorage.setItem('files_' + committeeId, JSON.stringify(updated));
  };

  const deleteFile = (id: number) => {
    const updated = files.filter(f => f.id !== id);
    setFiles(updated);
    localStorage.setItem('files_' + committeeId, JSON.stringify(updated));
  };

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    const msg = { id: Date.now(), text: newMessage.trim(), sender: committee.lead, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    const updated = [...messages, msg];
    setMessages(updated);
    localStorage.setItem('chat_' + committeeId, JSON.stringify(updated));
    setNewMessage('');
  };

  const stats = { total: tasks.length, done: tasks.filter(t => t.status === 'done').length, inProgress: tasks.filter(t => t.status === 'in_progress').length, blocked: tasks.filter(t => t.status === 'blocked').length };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{committee.name}</h1>
            <p className="text-gray-500 text-sm mt-1">Lead: {committee.lead} · {committee.members.length} members</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowFiles(!showFiles); setShowChat(false); }} className={`px-4 py-2 rounded-lg flex items-center gap-2 border text-sm font-medium transition-colors ${showFiles ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
              <Upload className="h-4 w-4" /> Files {files.length > 0 && <span className="bg-blue-100 text-blue-800 text-xs px-1.5 py-0.5 rounded-full">{files.length}</span>}
            </button>
            <button onClick={() => { setShowChat(!showChat); setShowFiles(false); }} className={`px-4 py-2 rounded-lg flex items-center gap-2 border text-sm font-medium transition-colors ${showChat ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
              <MessageSquare className="h-4 w-4" /> Chat {messages.length > 0 && <span className="bg-purple-100 text-purple-800 text-xs px-1.5 py-0.5 rounded-full">{messages.length}</span>}
            </button>
          </div>
        </div>

        {/* Stats */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tasks...
          </div>
        )}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[{ label: 'Total', val: stats.total, color: 'text-gray-900' }, { label: 'Completed', val: stats.done, color: 'text-green-600' }, { label: 'In Progress', val: stats.inProgress, color: 'text-blue-600' }, { label: 'Blocked', val: stats.blocked, color: 'text-red-600' }].map(s => (
            <div key={s.label} className="bg-white rounded-lg p-4 shadow-sm text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-sm text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          {/* Task Board */}
          <div className="flex-1 bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-gray-50 border-b grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              <div className="col-span-4">Task</div>
              <div className="col-span-2">Assignee</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1">Priority</div>
              <div className="col-span-2">Due Date</div>
              <div className="col-span-1"></div>
            </div>
            <div className="divide-y divide-gray-100">
              {tasks.length === 0 && !isLoading && !showAddTask && (
                <div className="px-4 py-10 text-center text-sm text-gray-400">
                  No tasks yet. Click <span className="font-medium text-blue-600">+ Add Task</span> to get started.
                </div>
              )}
              {tasks.map(task => (
                <div key={task.id} className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-gray-50 items-center">
                  <div className="col-span-4">
                    <input type="text" value={task.title} onChange={e => updateTask(task.id, 'title', e.target.value)} className="w-full px-2 py-1 border border-transparent hover:border-gray-200 rounded focus:outline-none focus:border-blue-400 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <select value={task.assignee} onChange={e => updateTask(task.id, 'assignee', e.target.value)} className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400">
                      <option value="">Unassigned</option>
                      {committee.members.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <select value={task.status} onChange={e => updateTask(task.id, 'status', e.target.value)} className={`w-full px-2 py-1 border rounded text-xs font-medium ${statusStyle[task.status] ?? ''}`}>
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                  <div className="col-span-1">
                    <select value={task.priority} onChange={e => updateTask(task.id, 'priority', e.target.value)} className={`w-full px-1 py-1 border rounded text-xs font-medium ${priorityStyle[task.priority] ?? ''}`}>
                      <option value="low">Low</option>
                      <option value="medium">Med</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input type="date" value={task.dueDate} onChange={e => updateTask(task.id, 'dueDate', e.target.value)} className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-blue-400" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button onClick={() => deleteTask(task.id)} className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {showAddTask ? (
                <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-blue-50 items-center">
                  <div className="col-span-5">
                    <input type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="Enter task title..." autoFocus className="w-full px-3 py-1.5 border border-blue-300 rounded text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="col-span-7 flex gap-2">
                    <button onClick={addTask} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Save</button>
                    <button onClick={() => { setShowAddTask(false); setNewTaskTitle(''); }} className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3">
                  <button onClick={() => setShowAddTask(true)} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium">
                    <Plus className="h-4 w-4" /> Add Task
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Files Panel */}
          {showFiles && (
            <div className="w-72 bg-white rounded-lg shadow flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-900">Files</h3>
                <button onClick={() => setShowFiles(false)}><X className="h-4 w-4 text-gray-400 hover:text-gray-600" /></button>
              </div>
              <div className="p-3 border-b">
                <label className="cursor-pointer block">
                  <div className="border-2 border-dashed border-blue-200 rounded-lg p-4 text-center hover:bg-blue-50 transition-colors">
                    <Upload className="h-6 w-6 text-blue-400 mx-auto mb-1" />
                    <p className="text-sm text-blue-600 font-medium">Upload files</p>
                    <p className="text-xs text-gray-400 mt-0.5">Any format</p>
                  </div>
                  <input type="file" multiple className="hidden" onChange={handleUpload} />
                </label>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {files.length === 0
                  ? <p className="text-xs text-gray-400 text-center mt-6">No files yet</p>
                  : files.map(f => (
                    <div key={f.id} className="flex items-start justify-between bg-gray-50 rounded p-2 gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{f.name}</p>
                        <p className="text-xs text-gray-400">{f.size} · {f.by}</p>
                        <p className="text-xs text-gray-300">{f.at}</p>
                      </div>
                      <button onClick={() => deleteFile(f.id)} className="text-gray-300 hover:text-red-400 mt-0.5"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Chat Panel */}
          {showChat && (
            <div className="w-72 bg-white rounded-lg shadow flex flex-col" style={{ height: '520px' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-900">Team Discussion</h3>
                <button onClick={() => setShowChat(false)}><X className="h-4 w-4 text-gray-400 hover:text-gray-600" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0
                  ? <p className="text-xs text-gray-400 text-center mt-6">No messages yet. Start the conversation!</p>
                  : messages.map(m => (
                    <div key={m.id}>
                      <div className="flex items-baseline gap-1 mb-0.5">
                        <span className="text-xs font-semibold text-purple-700">{m.sender}</span>
                        <span className="text-xs text-gray-400">{m.time}</span>
                      </div>
                      <div className="bg-purple-50 rounded-lg px-3 py-2 text-sm text-gray-800 break-words">{m.text}</div>
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
