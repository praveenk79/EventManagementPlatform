import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    // Create the redirect response first so we can set cookies on it
    const supabaseResponse = NextResponse.redirect(`${origin}/admin`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            // Read PKCE verifier from the incoming request cookies
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
            // Write session cookies onto the redirect response
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Error exchanging code for session:', error);
        return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
      }

      // Return response with session cookies set
      return supabaseResponse;
    } catch (err) {
      console.error('Unexpected error during authentication:', err);
      return NextResponse.redirect(`${origin}/auth/login?error=unexpected`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=no_code`);
}
