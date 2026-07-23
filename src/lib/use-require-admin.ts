'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';

// Page-level guard for admin-only screens. The nav hides admin links from
// non-admins, but that's cosmetic — this enforces it so a member who types the
// URL (or follows a stale link) is redirected away instead of seeing the shell.
// Data is separately protected by RLS; this is the UX/enforcement layer.
export function useRequireAdmin() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/');
    }
  }, [loading, isAdmin, router]);

  return { allowed: isAdmin, checking: loading };
}
