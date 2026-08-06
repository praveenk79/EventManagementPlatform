'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { MapPin, Mic, Coffee, Users, Trophy, Plus, Trash2, GripVertical, Pencil, Check, Loader2, ChevronDown, Copy, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useEvent } from '@/lib/event-context';

type SessionType = 'keynote' | 'panel' | 'workshop' | 'session' | 'speaker' | 'ceremony' | 'social' | 'break' | 'registration' | 'awards' | 'lunch';

type Session = {
  id: string;
  orderIndex: number;
  time: string;
  durationMinutes: number;
  title: string;
  type: SessionType;
  location: string;
  speakerName: string;
};

type ProgramDay = {
  id: string;
  dayNumber: number;
  date: string;
  sessions: Session[];
};

const MAX_DAYS = 5;
const SESSION_TYPES: SessionType[] = ['keynote', 'panel', 'workshop', 'session', 'speaker', 'ceremony', 'social', 'break', 'registration', 'awards', 'lunch'];

const TOD_CONFIG: Record<string, { emoji: string; headerClass: string }> = {
  Morning:   { emoji: '🌅', headerClass: 'text-orange-700 bg-orange-50/80' },
  Afternoon: { emoji: '☀️', headerClass: 'text-yellow-700 bg-yellow-50/80' },
  Evening:   { emoji: '🌙', headerClass: 'text-indigo-700 bg-indigo-50/80' },
  Night:     { emoji: '🌃', headerClass: 'text-violet-700 bg-violet-50/80' },
  Other:     { emoji: '🕐', headerClass: 'text-gray-500 bg-gray-50' },
};

const typeConfig: Record<SessionType, { color: string; icon: React.ReactNode }> = {
  keynote: { color: 'bg-blue-50 border-blue-200 text-blue-700', icon: <Mic className="h-3.5 w-3.5" /> },
  panel: { color: 'bg-purple-50 border-purple-200 text-purple-700', icon: <Users className="h-3.5 w-3.5" /> },
  workshop: { color: 'bg-amber-50 border-amber-200 text-amber-700', icon: <Users className="h-3.5 w-3.5" /> },
  session: { color: 'bg-indigo-50 border-indigo-200 text-indigo-700', icon: <Mic className="h-3.5 w-3.5" /> },
  ceremony: { color: 'bg-yellow-50 border-yellow-200 text-yellow-700', icon: <Trophy className="h-3.5 w-3.5" /> },
  social: { color: 'bg-green-50 border-green-200 text-green-700', icon: <Users className="h-3.5 w-3.5" /> },
  break: { color: 'bg-gray-50 border-gray-200 text-gray-500', icon: <Coffee className="h-3.5 w-3.5" /> },
  registration: { color: 'bg-teal-50 border-teal-200 text-teal-700', icon: <Users className="h-3.5 w-3.5" /> },
  awards: { color: 'bg-yellow-50 border-yellow-200 text-yellow-700', icon: <Trophy className="h-3.5 w-3.5" /> },
  lunch: { color: 'bg-orange-50 border-orange-200 text-orange-700', icon: <Coffee className="h-3.5 w-3.5" /> },
  speaker: { color: 'bg-rose-50 border-rose-200 text-rose-700', icon: <Mic className="h-3.5 w-3.5" /> },
};

function formatDate(iso: string | null) {
  if (!iso) return 'No date set';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return 'No date set';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getTimeOfDay(datetimeLocal: string): { label: string; color: string } | null {
  if (!datetimeLocal) return null;
  const timePart = datetimeLocal.split('T')[1];
  if (!timePart) return null;
  const h = parseInt(timePart.split(':')[0], 10);
  if (h < 12) return { label: 'Morning', color: 'bg-orange-50 text-orange-600 border border-orange-200' };
  if (h < 17) return { label: 'Afternoon', color: 'bg-yellow-50 text-yellow-600 border border-yellow-200' };
  return { label: 'Evening', color: 'bg-indigo-50 text-indigo-600 border border-indigo-200' };
}

function formatTimeLabel(datetimeLocal: string): string {
  if (!datetimeLocal) return '';
  const timePart = datetimeLocal.split('T')[1];
  if (!timePart) return '';
  const [hStr, mStr] = timePart.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function calcDuration(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const diffMs = new Date(endTime).getTime() - new Date(startTime).getTime();
  return Math.max(0, Math.round(diffMs / 60000));
}

function timeLabelToDatetimeLocal(timeLabel: string, date: string): string {
  if (!timeLabel || !date) return '';
  const match = timeLabel.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return '';
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${date}T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function addMinutesToLabel(timeLabel: string, minutes: number): string {
  if (!timeLabel || !minutes) return '';
  const match = timeLabel.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return '';
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const totalMins = h * 60 + m + minutes;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  const endAmpm = endH >= 12 ? 'PM' : 'AM';
  const endH12 = endH % 12 || 12;
  return `${endH12}:${endM.toString().padStart(2, '0')} ${endAmpm}`;
}

function getTimeOfDayFromLabel(timeLabel: string): 'Morning' | 'Afternoon' | 'Evening' | 'Night' | null {
  if (!timeLabel) return null;
  const match = timeLabel.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Night';
}

function emptySessionDraft() {
  return { startTime: '', endTime: '', title: '', type: 'session' as SessionType, location: '', speakerName: '' };
}

export default function ProgramsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { currentEventId } = useEvent();
  const supabase = useMemo(() => createClient(), []);

  const [days, setDays] = useState<ProgramDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [addingToDay, setAddingToDay] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  const toggleGroup = (key: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const [draft, setDraft] = useState(emptySessionDraft());

  const load = useCallback(async () => {
    setIsLoading(true);

    if (!currentEventId) {
      setDays([]);
      setIsLoading(false);
      return;
    }

    const { data: dayRows } = await supabase.from('program_days').select('*').eq('event_id', currentEventId).order('day_number');
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
        speakerName: s.speaker_name ?? '',
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
  }, [supabase, currentEventId]);

  useEffect(() => {
    load();
  }, [load, currentEventId]);

  const addDay = async () => {
    if (days.length >= MAX_DAYS) return;
    if (!currentEventId) {
      toast.error('Select an event first.');
      return;
    }
    const usedNumbers = new Set(days.map(d => d.dayNumber));
    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) nextNumber++;
    const { error } = await supabase.from('program_days').insert({ day_number: nextNumber, event_id: currentEventId });
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
    setEditingSessionId(null);
    const day = days.find(d => d.id === dayId);
    const datePrefix = day?.date ?? '';
    setDraft({
      startTime: datePrefix ? `${datePrefix}T09:00` : '',
      endTime: datePrefix ? `${datePrefix}T10:00` : '',
      title: '',
      type: 'session' as SessionType,
      location: '',
      speakerName: '',
    });
  };

  const startEditSession = (dayId: string, session: Session) => {
    const day = days.find(d => d.id === dayId);
    const date = day?.date ?? '';
    const startTime = timeLabelToDatetimeLocal(session.time, date);
    let endTime = startTime;
    if (startTime && session.durationMinutes > 0) {
      const d = new Date(startTime);
      d.setMinutes(d.getMinutes() + session.durationMinutes);
      const pad = (n: number) => n.toString().padStart(2, '0');
      endTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    setAddingToDay(dayId);
    setEditingSessionId(session.id);
    setDraft({ startTime, endTime, title: session.title, type: session.type, location: session.location, speakerName: session.speakerName });
  };

  const duplicateSession = async (dayId: string, session: Session) => {
    const day = days.find(d => d.id === dayId);
    const nextOrderIndex = day ? day.sessions.length : 0;
    const payload: Record<string, unknown> = {
      program_day_id: dayId,
      order_index: nextOrderIndex,
      time_label: session.time,
      duration_minutes: session.durationMinutes,
      session_type: session.type,
      title: session.title + ' (copy)',
      location: session.location,
    };
    if (session.speakerName) payload.speaker_name = session.speakerName;
    const { error } = await supabase.from('program_sessions').insert(payload);
    load();
    if (error) toast.error('Could not duplicate that session.');
    else toast.success('Session duplicated');
  };

  const saveSession = async () => {
    if (addingToDay === null || !draft.title.trim() || !draft.startTime) return;
    const timeLabel = formatTimeLabel(draft.startTime);
    const durationMinutes = calcDuration(draft.startTime, draft.endTime);

    if (editingSessionId) {
      const updatePayload: Record<string, unknown> = {
        time_label: timeLabel,
        duration_minutes: durationMinutes,
        session_type: draft.type,
        title: draft.title.trim(),
        location: draft.location.trim(),
      };
      if (draft.speakerName.trim()) updatePayload.speaker_name = draft.speakerName.trim();
      const { error } = await supabase.from('program_sessions').update(updatePayload).eq('id', editingSessionId);
      setAddingToDay(null);
      setEditingSessionId(null);
      load();
      if (error) toast.error('Could not update that session.');
      else toast.success('Session updated');
    } else {
      const day = days.find(d => d.id === addingToDay);
      const nextOrderIndex = day ? day.sessions.length : 0;
      const insertPayload: Record<string, unknown> = {
        program_day_id: addingToDay,
        order_index: nextOrderIndex,
        time_label: timeLabel,
        duration_minutes: durationMinutes,
        session_type: draft.type,
        title: draft.title.trim(),
        location: draft.location.trim(),
      };
      if (draft.speakerName.trim()) insertPayload.speaker_name = draft.speakerName.trim();
      const { error } = await supabase.from('program_sessions').insert(insertPayload);
      setAddingToDay(null);
      load();
      if (error) toast.error('Could not add that session.');
      else toast.success('Session added');
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
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => window.print()}
              className="shrink-0 flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              title="Print program"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
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
        </div>

        <div className="space-y-10">
          {sortedDays.map(day => (
            <div key={day.id}>
              <div className="flex items-center gap-3 mb-1">
                <div className="bg-indigo-600 text-white text-sm font-semibold px-3 py-1 rounded-full">Day {day.dayNumber}</div>
                {isEditing ? (
                  <>
                    <input
                      type="date"
                      value={day.date ?? ''}
                      onChange={e => updateDayDate(day.id, e.target.value)}
                      className="text-sm text-gray-600 border border-gray-200 rounded-md px-2 py-1 print:hidden"
                    />
                    <span className="hidden print:inline text-gray-500 text-sm">{formatDate(day.date)}</span>
                  </>
                ) : (
                  <span className="text-gray-500 text-sm">{formatDate(day.date)}</span>
                )}
                {isEditing && (
                  <button onClick={() => deleteDay(day.id)} className="ml-auto p-2 -mr-2 text-gray-400 hover:text-red-600 transition-colors print:hidden" title="Delete day" aria-label="Delete day">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {day.sessions.length > 0 && (() => {
                const parts: string[] = [];
                for (const g of ['Morning', 'Afternoon', 'Evening', 'Night']) {
                  const count = day.sessions.filter(s => (getTimeOfDayFromLabel(s.time) ?? 'Other') === g).length;
                  if (count > 0) parts.push(`${count} ${g}`);
                }
                return parts.length > 0 ? <p className="text-xs text-gray-400 mb-3">{parts.join(' · ')}</p> : null;
              })()}

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {day.sessions.length === 0 && <div className="px-6 py-8 text-center text-sm text-gray-400">No sessions yet</div>}
                {day.sessions.length > 0 && (() => {
                  const groups: Record<string, Session[]> = { Morning: [], Afternoon: [], Evening: [], Night: [], Other: [] };
                  for (const s of day.sessions) {
                    const tod = getTimeOfDayFromLabel(s.time) ?? 'Other';
                    groups[tod].push(s);
                  }
                  const orderedGroups = (['Morning', 'Afternoon', 'Evening', 'Night', 'Other'] as const).filter(g => groups[g].length > 0);
                  return orderedGroups.map((groupName, gi) => {
                    const todConf = TOD_CONFIG[groupName];
                    const groupSessions = groups[groupName];
                    return (
                      <div key={groupName} className={gi > 0 ? 'border-t border-gray-100' : ''}>
                        {(() => {
                          const groupKey = `${day.id}_${groupName}`;
                          const isCollapsed = collapsedGroups.has(groupKey);
                          return (
                            <>
                              <div className={`flex items-center ${todConf.headerClass}`}>
                                <button
                                  type="button"
                                  onClick={() => toggleGroup(groupKey)}
                                  className="flex-1 px-4 sm:px-6 py-2.5 flex items-center gap-2 text-xs font-semibold hover:opacity-90 transition-opacity"
                                >
                                  <span>{todConf.emoji}</span>
                                  <span>{groupName}</span>
                                  <span className="font-normal opacity-60">{groupSessions.length} session{groupSessions.length !== 1 ? 's' : ''}</span>
                                  <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                </button>
                                {isEditing && (
                                  <button
                                    type="button"
                                    onClick={() => startAddSession(day.id)}
                                    className="px-3 py-2.5 text-xs font-semibold hover:opacity-90 transition-opacity print:hidden"
                                    title={`Add session to ${groupName}`}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              {!isCollapsed && groupSessions.map((session, i) => {
                          const config = typeConfig[session.type] ?? typeConfig.break;
                          return (
                            <div
                              key={session.id}
                              draggable={isEditing}
                              onDragStart={() => setDraggedSessionId(session.id)}
                              onDragOver={e => e.preventDefault()}
                              onDrop={() => handleDrop(day.id, session.id)}
                              className={`flex gap-3 sm:gap-4 px-4 sm:px-6 py-4 ${i < groupSessions.length - 1 ? 'border-b border-gray-100' : ''} ${
                                isEditing ? 'cursor-move hover:bg-gray-50' : ''
                              }`}
                            >
                              {isEditing && (
                                <div className="flex items-center text-gray-300 shrink-0 print:hidden">
                                  <GripVertical className="h-4 w-4" />
                                </div>
                              )}
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-medium text-gray-900 whitespace-nowrap">
                                  {session.time}{session.durationMinutes > 0 && addMinutesToLabel(session.time, session.durationMinutes) ? ` → ${addMinutesToLabel(session.time, session.durationMinutes)}` : ''}
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
                                {session.speakerName && (
                                  <p className="text-xs text-rose-500 mt-1 font-medium">{session.speakerName}</p>
                                )}
                                {session.location && (
                                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {session.location}
                                  </p>
                                )}
                              </div>
                              {isEditing && (
                                <div className="flex gap-1 shrink-0 print:hidden">
                                  <button
                                    onClick={() => duplicateSession(day.id, session)}
                                    className="p-2 self-start text-gray-300 hover:text-green-600 transition-colors"
                                    title="Duplicate session"
                                    aria-label="Duplicate session"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => startEditSession(day.id, session)}
                                    className="p-2 self-start text-gray-300 hover:text-indigo-600 transition-colors"
                                    title="Edit session"
                                    aria-label="Edit session"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => deleteSession(day.id, session.id)}
                                    className="p-2 -mr-2 self-start text-gray-300 hover:text-red-600 transition-colors"
                                    title="Delete session"
                                    aria-label="Delete session"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                            </>
                          );
                        })()
                        }
                      </div>
                    );
                  });
                })()}

                {isEditing && addingToDay === day.id && (
                  <div className="px-6 py-4 bg-indigo-50/50 border-t border-gray-100 space-y-3 print:hidden">
                    <p className="text-xs font-semibold text-indigo-700">{editingSessionId ? 'Edit Session' : 'New Session'}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="datetime-local"
                            value={draft.startTime}
                            onChange={e => setDraft({ ...draft, startTime: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-indigo-400"
                          />
                          {getTimeOfDay(draft.startTime) && (
                            <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${getTimeOfDay(draft.startTime)!.color}`}>
                              {getTimeOfDay(draft.startTime)!.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          To{draft.startTime && draft.endTime && calcDuration(draft.startTime, draft.endTime) > 0 && (
                            <span className="ml-1 font-normal text-gray-400">({calcDuration(draft.startTime, draft.endTime)} min)</span>
                          )}
                        </label>
                        <input
                          type="datetime-local"
                          value={draft.endTime}
                          onChange={e => setDraft({ ...draft, endTime: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-indigo-400"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
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
                      placeholder={draft.type === 'speaker' ? 'Talk title / Topic' : 'Session title'}
                      autoFocus
                      value={draft.title}
                      onChange={e => setDraft({ ...draft, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-indigo-400"
                    />
                    {draft.type === 'speaker' && (
                      <input
                        type="text"
                        placeholder="Speaker name"
                        value={draft.speakerName}
                        onChange={e => setDraft({ ...draft, speakerName: e.target.value })}
                        className="w-full px-3 py-2 border border-rose-200 rounded-md text-sm focus:outline-none focus:border-rose-400"
                      />
                    )}
                    <div className="flex gap-2">
                      <button onClick={saveSession} className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700">
                        {editingSessionId ? 'Update Session' : 'Save Session'}
                      </button>
                      <button onClick={() => { setAddingToDay(null); setEditingSessionId(null); }} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {isEditing && addingToDay !== day.id && (
                  <div className="px-6 py-3 border-t border-gray-100 print:hidden">
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
            className="mt-6 w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors text-sm font-medium print:hidden"
          >
            <Plus className="h-4 w-4" /> Add Day {days.length > 0 ? `(${days.length}/${MAX_DAYS})` : ''}
          </button>
        )}

        <div className="mt-8 text-center print:hidden">
          <Link href="/" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
