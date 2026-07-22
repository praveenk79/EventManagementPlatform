import { createClient as createBrowserClient } from './client';
import { createClient as createServerClient } from './server';

/**
 * Get the current authenticated user from the browser
 * Use this in Client Components
 */
export async function getCurrentUser() {
  const supabase = createBrowserClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('Error fetching user:', error);
    return null;
  }
  
  return user;
}

/**
 * Get the current authenticated user from the server
 * Use this in Server Components, Route Handlers, and Server Actions
 */
export async function getCurrentUserServer() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('Error fetching user:', error);
    return null;
  }
  
  return user;
}

/**
 * Get the current session from the browser
 * Use this in Client Components
 */
export async function getCurrentSession() {
  const supabase = createBrowserClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('Error fetching session:', error);
    return null;
  }
  
  return session;
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}
