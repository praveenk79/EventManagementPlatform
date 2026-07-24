import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase client using the service_role key. This BYPASSES RLS,
// so it must never be imported into client code. Use it only inside API routes
// / server code that has already verified who the caller is.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
