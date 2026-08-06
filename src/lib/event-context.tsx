'use client';

// Tracks which event is "currently selected" for admin screens that manage
// more than one event per company (admin-committees, admin dashboard,
// admin-tasks, programs). Plain committee members never see this — their
// data is already correctly scoped by committee membership via RLS
// (is_committee_member), independent of whatever event an admin has selected.
//
// The event LIST and the DEFAULT selection always come from Supabase — this
// context is not a data store. localStorage is used only as a convenience so
// an admin's choice survives a refresh; if the cached id no longer matches a
// real event (deleted, or a different browser/session), it's silently
// ignored and the default takes over. See feedback_no_localstorage memory.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

export interface EventRow {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  status: 'active' | 'archived';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

interface EventContextType {
  companyId: string | null;
  events: EventRow[];
  currentEventId: string | null;
  currentEvent: EventRow | null;
  setCurrentEventId: (id: string) => void;
  loading: boolean;
  refreshEvents: () => Promise<void>;
}

const STORAGE_KEY = 'currentEventId';

const EventContext = createContext<EventContextType | undefined>(undefined);

export function EventProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [supabase] = useState(() => createClient());
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [currentEventId, setCurrentEventIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: companyRows }, { data: eventRows }] = await Promise.all([
      supabase.from('companies').select('id').limit(1),
      supabase.from('events').select('*').order('created_at', { ascending: true }),
    ]);
    setCompanyId(companyRows?.[0]?.id ?? null);
    const all = eventRows ?? [];
    setEvents(all);

    setCurrentEventIdState(prev => {
      if (prev && all.some(e => e.id === prev)) return prev;
      const cached = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (cached && all.some(e => e.id === cached)) return cached;
      const firstActive = all.find(e => e.status === 'active') ?? all[0];
      return firstActive?.id ?? null;
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (authLoading || !user) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, user, load]);

  const setCurrentEventId = (id: string) => {
    setCurrentEventIdState(id);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, id);
  };

  const currentEvent = events.find(e => e.id === currentEventId) ?? null;

  return (
    <EventContext.Provider
      value={{ companyId, events, currentEventId, currentEvent, setCurrentEventId, loading, refreshEvents: load }}
    >
      {children}
    </EventContext.Provider>
  );
}

export function useEvent() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error('useEvent must be used within an EventProvider');
  return ctx;
}
