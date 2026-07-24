import { NextResponse, type NextRequest } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Fan out a Web Push notification to the OTHER members of a committee when a
// message is sent. Triggered by the client right after the message insert.
//
// Security: we verify the caller's Supabase session server-side and confirm
// they are actually a member of the committee before sending anything — the
// client only tells us which committee, never who to notify.

export async function POST(request: NextRequest) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT_EMAIL || 'mailto:admin@example.com';
  if (!publicKey || !privateKey) {
    // Not configured yet — succeed quietly so message sending is never blocked.
    return NextResponse.json({ ok: false, reason: 'push_not_configured' });
  }
  webpush.setVapidDetails(contact, publicKey, privateKey);

  // 1. Who is calling? Must be logged in.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: 'unauthenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const committeeId: string | undefined = body?.committeeId;
  const messageBody: string | undefined = body?.body;
  if (!committeeId) {
    return NextResponse.json({ ok: false, reason: 'missing_committee' }, { status: 400 });
  }

  // 2. Is the caller actually a member of this committee? (RLS-checked read.)
  const { data: callerMembership } = await supabase
    .from('committee_members')
    .select('committee_id')
    .eq('committee_id', committeeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!callerMembership) {
    return NextResponse.json({ ok: false, reason: 'not_a_member' }, { status: 403 });
  }

  // 3. From here we use the service-role client to read recipients' data.
  const admin = createAdminClient();

  const [{ data: committee }, { data: sender }, { data: members }] = await Promise.all([
    admin.from('committees').select('name').eq('id', committeeId).single(),
    admin.from('profiles').select('full_name, email').eq('id', user.id).single(),
    admin.from('committee_members').select('user_id').eq('committee_id', committeeId),
  ]);

  const recipientIds = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => id !== user.id); // don't notify the sender
  if (recipientIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', recipientIds);
  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const senderName = sender?.full_name || sender?.email || 'A teammate';
  const committeeName = committee?.name || 'your committee';
  const preview = (messageBody || '').slice(0, 120);

  const payload = JSON.stringify({
    title: `${senderName} · ${committeeName}`,
    body: preview || 'New message',
    url: `/committee/${committeeId}`,
    tag: `committee-${committeeId}`,
  });

  // Send to every subscribed device. Prune subscriptions the browser has
  // expired (404/410) so we don't keep trying dead endpoints.
  const staleIds: string[] = [];
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        )
        .catch((err: unknown) => {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) staleIds.push(s.id);
          throw err;
        })
    )
  );

  if (staleIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', staleIds);
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return NextResponse.json({ ok: true, sent });
}
