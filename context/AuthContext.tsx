'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session and user
    Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession()
    ]).then(([{ data: { user } }, { data: { session } }]) => {
      setUser(user);
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export async function signInWithGoogle() {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Google sign-in error:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Sign-in failed',
    };
  }
}

export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Sign-out error:', error);
    return {
      error: error instanceof Error ? error.message : 'Sign-out failed',
    };
  }
}

export async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return { user: data.user, error: null };
  } catch (error) {
    console.error('Get user error:', error);
    return {
      user: null,
      error: error instanceof Error ? error.message : 'Failed to get user',
    };
  }
}

export const useAuth = () => useContext(AuthContext);