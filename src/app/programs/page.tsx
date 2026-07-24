'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Clock, MapPin, Mic, Coffee, Users, Trophy, Plus, Trash2, GripVertical, Pencil, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type SessionType = 'keynote' | 'panel' | 'workshop' | 'session' | 'ceremony' | 'social' | 'break';

type Session = {
  id: string;
  orderIndex: number;
  time: string;
  durationMinutes: number;
  title: string;
  type: SessionType;
  location: string;
};

type ProgramDay = {
  id: string;
  dayNumber: number;
  date: string;
  sessions: Session[];
};

const MAX_DAYS = 5;
const SESSION_TYPES: SessionType[] = ['keynote', 'panel', 'workshop', 'session', 'ceremony', 'social', 'break'];

const typeConfig: Record<SessionType, { color: string; icon: React.ReactNode }> = {
  keynote: { color: 'bg-blue-50 border-blue-200 text-blue-700', icon: <Mic className="h-3.5 w-3.5" /> },
  panel: { color: 'bg-purple-50 border-purple-200 text-purple-700', icon: <Users className="h-3.5 w-3.5" /> },
  workshop: { color: 'bg-amber-50 border-amber-200 text-amber-700', icon: <Users className="h-3.5 w-3.5" /> },
  session: { color: 'bg-indigo-50 border-indigo-200 text-indigo-700', icon: <Mic className="h-3.5 w-3.5" /> },
  ceremony: { color: 'bg-yellow-50 border-yellow-200 text-yellow-700', icon: <Trophy className="h-3.5 w-3.5" /> },
  social: { color: 'bg-green-50 border-green-200 text-green-700', icon: <Users className="h-3.5 w-3.5" /> },
  break: { color: 'bg-gray-50 border-gray-200 text-gray-500', icon: <Coffee className="h-3.5 w-3.5" /> },
};

function formatDate(iso: string | null) {
  if (!iso) return 'No date set';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return 'No date set';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function emptySessionDraft() {
  return { time: '', durationMinutes: 60, title: '', type: 'session' as SessionType, location: '' };
}

export default function ProgramsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [days, setDays] = useState<ProgramDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [addingToDay, setAddingToDay] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptySessionDraft());

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data: dayRows } = await supabase.from('program_days').select('*').order('day_number');
    const { data: sessionRows } = await supabase.from('program_sessions').select('*').order('order_index');

    const sessionsByDay: Record<string, Session[]> = {};
    for (const s of sessionRows ?? []) {
      (sessionsByDay[s.program_day_id] ??= []).push({
        id: s.id,
        orderIndex: s.order_index,
        time: s.time_label ?? '',
        durationMinutes: s.duration_minutes ?? 0,
        title: s.title,
        type: (s.session_type as SessionType) ?? 'session',
        location: s.location ?? '',
      });
    }

    setDays(
      (dayRows ?? []).map(d => ({
        id: d.id,
        dayNumber: d.day_number,
        date: d.date,
        sessions: sessionsByDay[d.id] ?? [],
      }))
    );
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const addDay = async () => {
    if (days.length >= MAX_DAYS) return;
    const usedNumbers = new Set(days.map(d => d.dayNumber));
    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) nextNumber++;
    const { error } = await supabase.from('program_days').insert({ day_number: nextNumber });
    load();
    if (error) toast.error('Could not add day.');
  };

  const deleteDay = async (dayId: string) => {
    setDays(prev => prev.filter(d => d.id !== dayId));
    const { error } = await supabase.from('program_days').delete().eq('id', dayId);
    if (error) toast.error('Could not delete that day.');
  };

  const updateDayDate = async (dayId: string, date: string) => {
    setDays(prev => prev.map(d => (d.id === dayId ? { ...d, date } : d)));
    const { error } = await supabase.from('program_days').update({ date: date || null }).eq('id', dayId);
    if (error) {
      toast.error('That date was not saved.');
    } else {
      toast.success('Saved');
    }
  };

  const deleteSession = async (dayId: string, sessionId: string) => {
    setDays(prev => prev.map(d => (d.id === dayId ? { ...d, sessions: d.sessions.filter(s => s.id !== sessionId) } : d)));
    const { error } = await supabase.from('program_sessions').delete().eq('id', sessionId);
    if (error) toast.error('Could not delete that session.');
  };

  const startAddSession = (dayId: string) => {
    setAddingToDay(dayId);
    setDraft(emptySessionDraft());
  };

  const saveNewSession = async () => {
    if (addingToDay === null || !draft.title.trim() || !draft.time.trim()) return;
    const day = days.find(d => d.id === addingToDay);
    const nextOrderIndex = day ? day.sessions.length : 0;
    const { error } = await supabase.from('program_sessions').insert({
      program_day_id: addingToDay,
      order_index: nextOrderIndex,
      time_label: draft.time.trim(),
      duration_minutes: draft.durationMinutes,
      session_type: draft.type,
      title: draft.title.trim(),
      location: draft.location.trim(),
    });
    setAddingToDay(null);
    load();
    if (error) {
      toast.error('Could not add that session.');
    } else {
      toast.success('Session added');
    }
  };

  const handleDrop = async (dayId: string, targetSessionId: string) => {
    if (!draggedSessionId || draggedSessionId === targetSessionId) return;
    const day = days.find(d => d.id === dayId);
    if (!day) return;
    const sessions = [...day.sessions];
    const fromIndex = sessions.findIndex(s => s.id === draggedSessionId);
    const toIndex = sessions.findIndex(s => s.id === targetSessionId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = sessions.splice(fromIndex, 1);
    sessions.splice(toIndex, 0, moved);

    setDays(prev => prev.map(d => (d.id === dayId ? { ...d, sessions } : d)));
    setDraggedSessionId(null);

    const results = await Promise.all(sessions.map((s, idx) => supabase.from('program_sessions').update({ order_index: idx }).eq('id', s.id)));
    if (results.some(r => r.error)) {
      toast.error('Could not save the new order.');
      load();
    }
  };

  const sortedDays = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Event Program</h1>
            <p className="text-gray-500 mt-1">
              {sortedDays.length > 0 ? `${sortedDays.length} day${sortedDays.length !== 1 ? 's' : ''} scheduled` : 'No program yet'}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`shrink-0 flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
                isEditing ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {isEditing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {isEditing ? 'Done Editing' : 'Edit Program'}
            </button>
          )}
        </div>

        <div className="space-y-10">
          {sortedDays.map(day => (
            <div key={day.id}>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-indigo-600 text-white text-sm font-semibold px-3 py-1 rounded-full">Day {day.dayNumber}</div>
                {isEditing ? (
                  <input
                    type="date"
                    value={day.date ?? ''}
                    onChange={e => updateDayDate(day.id, e.target.value)}
                    className="text-sm text-gray-600 border border-gray-200 rounded-md px-2 py-1"
                  />
                ) : (
                  <span className="text-gray-500 text-sm">{formatDate(day.date)}</span>
                )}
                {isEditing && (
                  <button onClick={() => deleteDay(day.id)} className="ml-auto p-2 -mr-2 text-gray-400 hover:text-red-600 transition-colors" title="Delete day" aria-label="Delete day">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {day.sessions.length === 0 && <div className="px-6 py-8 text-center text-sm text-gray-400">No sessions yet</div>}
                {day.sessions.map((session, i) => {
                  const config = typeConfig[session.type] ?? typeConfig.break;
                  return (
                    <div
                      key={session.id}
                      draggable={isEditing}
                      onDragStart={() => setDraggedSessionId(session.id)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleDrop(day.id, session.id)}
                      className={`flex gap-3 sm:gap-4 px-4 sm:px-6 py-4 ${i < day.sessions.length - 1 ? 'border-b border-gray-100' : ''} ${
                        isEditing ? 'cursor-move hover:bg-gray-50' : ''
                      }`}
                    >
                      {isEditing && (
                        <div className="flex items-center text-gray-300 shrink-0">
                          <GripVertical className="h-4 w-4" />
                        </div>
                      )}
                      <div className="w-20 shrink-0 text-right">
                        <div className="text-sm font-medium text-gray-900">{session.time}</div>
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center justify-end gap-0.5">
                          <Clock className="h-3 w-3" />
                          {session.durationMinutes} min
                        </div>
                      </div>
                      <div className="w-px bg-gray-100 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-gray-900">{session.title}</p>
                          <span className={`shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${config.color}`}>
                            {config.icon}
                            {session.type.charAt(0).toUpperCase() + session.type.slice(1)}
                          </span>
                        </div>
                        {session.location && (
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {session.location}
                          </p>
                        )}
                      </div>
                      {isEditing && (
                        <button
                          onClick={() => deleteSession(day.id, session.id)}
                          className="p-2 -mr-2 self-start text-gray-300 hover:text-red-600 transition-colors shrink-0"
                          title="Delete session"
                          aria-label="Delete session"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {isEditing && addingToDay === day.id && (
                  <div className="px-6 py-4 bg-indigo-50/50 border-t border-gray-100 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <input
                        type="text"
                        placeholder="9:00 AM"
                        value={draft.time}
                        onChange={e => setDraft({ ...draft, time: e.target.value })}
                        className="px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-indigo-400"
                      />
                      <input
                        type="number"
                        min={5}
                        placeholder="Minutes"
                        value={draft.durationMinutes}
                        onChange={e => setDraft({ ...draft, durationMinutes: Number(e.target.value) || 0 })}
                        className="px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-indigo-400"
                      />
                      <select
                        value={draft.type}
                        onChange={e => setDraft({ ...draft, type: e.target.value as SessionType })}
                        className="px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-indigo-400"
                      >
                        {SESSION_TYPES.map(t => (
                          <option key={t} value={t}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Location (optional)"
                        value={draft.location}
                        onChange={e => setDraft({ ...draft, location: e.target.value })}
                        className="px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Session title"
                      autoFocus
                      value={draft.title}
                      onChange={e => setDraft({ ...draft, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-indigo-400"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveNewSession} className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700">
                        Save Session
                      </button>
                      <button onClick={() => setAddingToDay(null)} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {isEditing && addingToDay !== day.id && (
                  <div className="px-6 py-3 border-t border-gray-100">
                    <button onClick={() => startAddSession(day.id)} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                      <Plus className="h-4 w-4" /> Add Session
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {sortedDays.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400 text-sm">
              {isAdmin ? <>No program days yet. Click &quot;Edit Program&quot; to add Day 1.</> : 'No program has been published yet.'}
            </div>
          )}
        </div>

        {isEditing && days.length < MAX_DAYS && (
          <button
            onClick={addDay}
            className="mt-6 w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Add Day {days.length > 0 ? `(${days.length}/${MAX_DAYS})` : ''}
          </button>
        )}

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
