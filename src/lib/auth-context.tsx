'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export type SystemRole = 'member' | 'admin' | 'super_admin';
export type CommitteeRole = 'volunteer' | 'head';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  system_role: SystemRole;
}

export interface CommitteeMembership {
  committee_id: string;
  role: CommitteeRole;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  committeeRoles: CommitteeMembership[];
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCommitteeHead: (committeeId: string) => boolean;
  isCommitteeMember: (committeeId: string) => boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [committeeRoles, setCommitteeRoles] = useState<CommitteeMembership[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfileAndMemberships = useCallback(async (userId: string) => {
    const [{ data: profileRow }, { data: memberships }] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, avatar_url, system_role').eq('id', userId).single(),
      supabase.from('committee_members').select('committee_id, role').eq('user_id', userId),
    ]);
    setProfile(profileRow ?? null);
    setCommitteeRoles(memberships ?? []);
  }, [supabase]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadProfileAndMemberships(session.user.id);
      }
      if (mounted) setLoading(false);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadProfileAndMemberships(session.user.id);
      } else {
        setProfile(null);
        setCommitteeRoles([]);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfileAndMemberships]);

  const isSuperAdmin = profile?.system_role === 'super_admin';
  const isAdmin = isSuperAdmin || profile?.system_role === 'admin';

  const isCommitteeHead = (committeeId: string) =>
    isAdmin || committeeRoles.some(c => c.committee_id === committeeId && c.role === 'head');

  const isCommitteeMember = (committeeId: string) =>
    isAdmin || committeeRoles.some(c => c.committee_id === committeeId);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        committeeRoles,
        loading,
        isAdmin,
        isSuperAdmin,
        isCommitteeHead,
        isCommitteeMember,
        refreshProfile: async () => {
          if (user) await loadProfileAndMemberships(user.id);
        },
        signOut: async () => {
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setProfile(null);
          setCommitteeRoles([]);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
