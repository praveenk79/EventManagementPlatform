'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Archive, CalendarRange, AlertCircle, Save, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useEvent, type EventRow } from '@/lib/event-context';
import AdminNav from '@/components/AdminNav';
import { useRequireAdmin } from '@/lib/use-require-admin';

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

function formatDateRange(startDate: string | null, endDate: string | null) {
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtNoYear = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (startDate && endDate) return `${fmtNoYear(startDate)} – ${fmt(endDate)}`;
  if (startDate) return `Starts ${fmt(startDate)}`;
  if (endDate) return `Ends ${fmt(endDate)}`;
  return 'No dates set';
}

export default function AdminEventManagement() {
  const { allowed, checking } = useRequireAdmin();
  const { profile } = useAuth();
  const { companyId, refreshEvents } = useEvent();
  const supabase = createClient();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', startDate: '', endDate: '' });
  const formRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data: eventRows } = await supabase.from('events').select('*').order('created_at', { ascending: true });
    setEvents(eventRows ?? []);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setFormData({ name: '', startDate: '', endDate: '' });
    setEditingId(null);
    setShowForm(false);
  };

  const addEvent = async () => {
    if (!formData.name.trim() || !profile || !companyId) return;
    const { error } = await supabase.from('events').insert({
      company_id: companyId,
      slug: slugify(formData.name),
      name: formData.name.trim(),
      start_date: formData.startDate || null,
      end_date: formData.endDate || null,
      created_by: profile.id,
    });
    if (error) {
      toast.error('Could not create that event — try a different name.');
      return;
    }
    resetForm();
    load();
    refreshEvents();
    toast.success('Event created');
  };

  const updateEvent = async () => {
    if (!formData.name.trim() || !editingId) return;
    const { error } = await supabase
      .from('events')
      .update({
        name: formData.name.trim(),
        start_date: formData.startDate || null,
        end_date: formData.endDate || null,
      })
      .eq('id', editingId);
    resetForm();
    load();
    refreshEvents();
    if (error) {
      toast.error('Could not save all changes.');
    } else {
      toast.success('Event updated');
    }
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from('events').delete().eq('id', id);
    load();
    refreshEvents();
    if (error) {
      toast.error('Could not delete that event.');
    } else {
      toast.success('Event deleted');
    }
  };

  const archiveEvent = async (id: string, status: 'active' | 'archived') => {
    const archived = status === 'archived';
    const { error } = await supabase.from('events').update({ status: archived ? 'active' : 'archived' }).eq('id', id);
    load();
    refreshEvents();
    if (error) {
      toast.error('Could not update that event.');
    } else {
      toast.success(archived ? 'Event unarchived' : 'Event archived');
    }
  };

  const startEdit = (event: EventRow) => {
    setFormData({ name: event.name, startDate: event.start_date ?? '', endDate: event.end_date ?? '' });
    setEditingId(event.id);
    setShowForm(true);
    // The form renders near the top; without this the pencil looks like it did
    // nothing when you click an event lower down the list.
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  if (checking || !allowed || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <AdminNav />
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Event Management</h1>
            <p className="text-gray-600 mt-2">Create and manage the events your company runs</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            disabled={!companyId}
            title={!companyId ? 'Still loading your company — try again in a moment.' : undefined}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Plus className="h-5 w-5" /> New Event
          </button>
        </div>

        {!companyId && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 mb-8 text-sm">
            Your company is still loading (or hasn&apos;t been provisioned yet), so you can&apos;t create an event right now.
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div ref={formRef} className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-indigo-600">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingId ? 'Edit Event' : 'New Event'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Event Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Fall Conference 2027"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={editingId ? updateEvent : addEvent}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2"
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
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-3xl font-bold text-indigo-600">{events.filter(e => e.status === 'active').length}</div>
            <div className="text-gray-600 text-sm mt-1">Active Events</div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-3xl font-bold text-gray-600">{events.filter(e => e.status === 'archived').length}</div>
            <div className="text-gray-600 text-sm mt-1">Archived Events</div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="text-3xl font-bold text-green-600">{events.length}</div>
            <div className="text-gray-600 text-sm mt-1">Total Events</div>
          </div>
        </div>

        {/* Events List */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">All Events</h2>
          {events.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center">
              <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No events yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map(event => {
                const archived = event.status === 'archived';
                return (
                  <div
                    key={event.id}
                    className={`bg-white rounded-lg shadow-sm p-6 flex items-start justify-between hover:shadow-md transition-shadow border-l-4 ${
                      archived ? 'border-gray-300 opacity-60' : 'border-indigo-600'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">{event.name}</h3>
                        {archived && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-medium shrink-0">Archived</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <CalendarRange className="h-4 w-4" />
                          <span className="font-medium text-gray-700">{formatDateRange(event.start_date, event.end_date)}</span>
                        </div>
                        <div className="text-xs text-gray-400">Created {new Date(event.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4 shrink-0">
                      <button
                        onClick={() => startEdit(event)}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Edit event"
                      >
                        <Edit2 className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => archiveEvent(event.id, event.status)}
                        className={`p-2 rounded-lg transition-colors ${
                          archived ? 'text-green-600 hover:bg-green-50' : 'text-orange-600 hover:bg-orange-50'
                        }`}
                        title={archived ? 'Unarchive event' : 'Archive event'}
                      >
                        <Archive className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => deleteEvent(event.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete event"
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
