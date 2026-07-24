# Event Platform — Architecture Checkpoint

Read this before re-exploring the codebase. Update it whenever a structural
change is made (new table, new page, new realtime channel, new auth rule).
Last updated: 2026-07-24.

## Stack
Next.js 15 (App Router, Turbopack) + React 19 + Supabase (Postgres, Auth,
Storage, Realtime) + Tailwind. No test suite exists yet. Package manager: npm.

## Auth
- Google OAuth only (no email/password). Middleware (`src/middleware.ts`)
  enforces auth on protected routes.
- `src/lib/auth-context.tsx` — `AuthProvider`/`useAuth()`. Loads `profile`
  (from `profiles`) and `committeeRoles` (from `committee_members`) once on
  session load, ALSO now subscribes to realtime changes on the user's own
  `profiles` row and `committee_members` rows so role/permission changes
  apply live without a refresh (added 2026-07-24).
- Two hardcoded super-admin emails (`praveen.konduru@gmail.com`,
  `praveenkonduru79@gmail.com`), enforced at the DB trigger level
  (`is_super_admin_email()` in `supabase/schema.sql`) — cannot be demoted.
- `src/lib/use-require-admin.ts` — page-level redirect guard for admin screens
  (UX layer only; RLS is the real enforcement).

## Roles
- System-wide: `member` (default), `admin`, `super_admin`.
- Per-committee: `volunteer` (default), `head`.
- Permission logic lives in `src/lib/rbac.ts` (pure types/helpers) and
  `auth-context.tsx` (`isAdmin`, `isCommitteeHead(id)`, `isCommitteeMember(id)`).

## Database (`supabase/schema.sql`, `supabase/lists.sql`)
Core tables: `profiles`, `committees`, `committee_members`, `tasks`,
`program_days`, `program_sessions`, `committee_files`, `committee_messages`,
`committee_lists`, `committee_list_columns`, `committee_list_rows`,
`push_subscriptions`.
All RLS-protected. SQL is delivered as files for the user to run manually in
Supabase SQL Editor — never run migrations against the live DB directly (see
memory `feedback_sql_migrations`).

**`supabase/push_subscriptions.sql`** (added 2026-07-24) — one row per
browser/device that a user granted notification permission on (keyed by
`endpoint`, so one user can have many). RLS: users manage only their own rows;
the server sender uses the service_role key (bypasses RLS) to read recipients'
subscriptions when fanning out. Run it in the SQL Editor.

**`supabase/enable_realtime.sql`** (added 2026-07-24, CONFIRMED RUN
2026-07-24) — adds `profiles`, `committee_members`, `tasks`,
`committee_messages`, `committee_list_rows`, `committee_list_columns` to the
`supabase_realtime` publication. Verified present via
`select tablename from pg_publication_tables where pubname = 'supabase_realtime';`
Without this, `postgres_changes` subscriptions connect but never receive
events. Re-check with that query if realtime ever appears silently inert.

## Realtime channels (client-side subscriptions)
- `committee/[id]/page.tsx` → channel `committee-${id}`: `tasks`,
  `committee_members`, `committee_messages` (filtered by `committee_id`).
  - **Chat is incremental (WhatsApp-style), NOT a full reload** (added
    2026-07-24). `tasks`/`committee_members` events still trigger a silent
    `loadEverything({ silent: true })`. But `committee_messages` events run
    `onMessageChange`, which appends/removes the single changed row via
    `setMessages` — the workspace is not re-fetched on every message. Sending
    is optimistic: `sendMessage` adds a temp-id bubble (`pending`), inserts,
    then swaps in the real id on success or marks it `failed` + restores the
    input text on error. Dedup: the realtime INSERT handler skips rows whose
    id is already present and reconciles the pending bubble by matching
    `pending && userId && body`. A `nameResolverRef` (updated via effect from
    `members`/`profile`) lets the channel resolve sender names without
    re-subscribing when membership changes. `chatEndRef` auto-scrolls to newest.
    Do NOT reintroduce `loadEverything` on the chat send/receive path.
- `committee/[id]/lists/[listId]/page.tsx` → channel `list-${listId}`:
  `committee_list_rows`, `committee_list_columns` (filtered by `list_id`).
- `auth-context.tsx` → channel `profile-roles-${userId}`: own `profiles` row
  UPDATE, own `committee_members` rows (added 2026-07-24).
- All depend on `enable_realtime.sql` having been run.

## UI feedback pattern
- Toasts via `sonner` (`<Toaster/>` mounted in `src/app/layout.tsx`).
  `import { toast } from 'sonner'` — `toast.success(...)` / `toast.error(...)`
  shown only once an action has actually completed (not per keystroke, not
  optimistically before the write resolves).
- **Table-styled grids use per-row edit mode with explicit Save/Cancel**
  (added 2026-07-24, replacing an earlier onChange/onBlur auto-save design
  that the user explicitly rejected — see memory `feedback_table_save_cancel`).
  Rows are read-only by default. Clicking the pencil icon puts one row into
  edit mode: all fields (including dropdowns/dates) become editable and are
  held in local draft state — nothing writes to Supabase yet. Save sends one
  batched update for the changed fields and shows a toast only after it
  resolves; Cancel discards the draft with no network call. Reference
  implementation: `editingTaskId`/`draftTask`/`startEditTask`/`saveTaskEdit`/
  `cancelEditTask` in `committee/[id]/page.tsx` (`renderTaskRow`), and
  `editingRowId`/`draftCells`/`startEditRow`/`saveRowEdit`/`cancelEditRow` in
  `committee/[id]/lists/[listId]/page.tsx` (`renderCellEditor`/
  `renderCellValue`). Use this pattern for any new editable-grid UI.
- Single-field, single-action controls (e.g. the program day date picker in
  `programs/page.tsx`, add/delete buttons) are fine to save instantly on
  change/click with a toast on completion — the Save/Cancel pattern above is
  specifically for multi-field table rows, not lone inputs.

## Push notifications (Web Push) — added 2026-07-24
Goal: let people know about new chat messages without logging in — part of the
"replace WhatsApp" goal. Web Push only (no email, by user decision — email
volume concern). Flow:
- **Service worker** `public/sw.js` (bumped to v2) — now handles `push` (shows
  a notification) and `notificationclick` (focuses/opens the committee URL), in
  addition to offline caching.
- **Client** `src/lib/push.ts` — `enablePushNotifications(userId)` registers the
  SW, requests permission, subscribes via `PushManager`, and upserts the
  subscription into `push_subscriptions` (onConflict: endpoint). Helpers:
  `pushSupported()`, `isStandalone()` (iOS home-screen check),
  `notificationPermission()`.
- **"Notify me" button** lives in the chat header (`committee/[id]/page.tsx`).
  `pushState` drives it: `default`→show button, `granted`→bell icon,
  `denied`→"blocked" banner, `needs-install`→iOS "Add to Home Screen" banner
  (iOS Safari cannot push until installed as a PWA), `unsupported`→hidden.
- **Send path**: after a successful message insert, `sendMessage` does a
  fire-and-forget `POST /api/notify-message` (never blocks the send).
- **API route** `src/app/api/notify-message/route.ts` — verifies the caller's
  session + committee membership (RLS client), then uses the **service-role**
  client (`src/lib/supabase/admin.ts`, server-only) to look up the other
  members' subscriptions and `web-push`-send to each. Prunes 404/410 (expired)
  subscriptions. Returns silently if VAPID env vars are unset.
- **Required env** (see `.env.example`): `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`.
  Generate VAPID keys with `npx web-push generate-vapid-keys`. Set all in
  Vercel (and `.env` locally). Without them, push is silently inert.
- **iOS caveat**: notifications require the user to Add to Home Screen and open
  from that icon (iOS 16.4+). Android works in-browser.

## Mobile / responsive ("behave like an app") — added 2026-07-24
Approach is **CSS/Tailwind breakpoints only** (no JS device detection / no
`useIsMobile` hook) — chosen deliberately to avoid first-paint flicker and SSR
hydration mismatches. Default mobile-first, layer desktop with `sm:`/`md:`.
- **Bottom tab bar** (`src/components/Navigation.tsx`): the top nav links are
  `hidden md:flex`; on mobile a `md:hidden fixed bottom-0` tab bar renders the
  same `navItems` (icon + label), honouring `env(safe-area-inset-bottom)`.
  `src/app/layout.tsx` `<main>` has `pb-[calc(64px+env(safe-area-inset-bottom))]
  md:pb-0` so content clears the bar. Any new top-level section should be added
  to `navItems` so it appears in BOTH navs.
- **Chat is a floating widget** (`committee/[id]/page.tsx`): `fixed inset-0`
  full-screen sheet on mobile, `sm:bottom-6 sm:right-6 sm:w-80 sm:h-[560px]`
  docked card on desktop. Input bar uses `pb-[calc(...safe-area-inset-bottom)]`.
- **No un-prefixed multi-column grids.** `grid grid-cols-3` etc. must carry a
  responsive base (`grid-cols-1 md:grid-cols-3`) so columns stack on phones.
  Fixed earlier in `admin-committees` (form + stats) and `admin-users`
  (permission matrix). Exception: the 3 stat cards stay 3-across with reduced
  `gap-2 sm:gap-4`.
- **Horizontal tab strips** (`AdminNav.tsx`) use `overflow-x-auto` +
  `whitespace-nowrap shrink-0` tabs rather than wrapping/clipping.
- **Tap targets**: icon buttons should be ~`p-2`+ (≥40px), not `p-1`/`p-0.5`.
  In-cell buttons inside the horizontally-scrolling list-detail spreadsheet
  (`lists/[listId]`) are intentionally left small to keep rows compact — the
  `overflow-x-auto` wrapper handles mobile there.
- **Overflow guards**: cards with a flexible text side + fixed action side use
  `min-w-0`+`truncate` on the text and `shrink-0` on the actions; metadata rows
  use `flex-wrap`.

## Pages
- `/` — landing/home.
- `/committee/[id]` — main committee workspace: tasks, files, chat, members.
- `/committee/[id]/lists` — index of spreadsheet-like lists for a committee.
- `/committee/[id]/lists/[listId]` — one list (dynamic columns/rows).
- `/admin-committees`, `/admin-users`, `/admin-templates` — admin management.
- `/admin` — admin dashboard landing.
- `/programs` — event-wide schedule (program days/sessions), admin-editable.
- `/committee-portal`, `/events`, `/events-management`, `/organizer`,
  `/speaker` — mostly legacy/stub pages from the pre-migration prototype, not
  the current production surface. `/events-management` and `/events` are
  known unimplemented stubs (deferred multi-event support).

## Known gaps (not yet addressed)
- No automated test suite.
- npm audit reports pre-existing high/critical vulns in `next`/`postcss`
  (via transitive deps) — flagged, not fixed, since upgrading Next is a
  separate decision from the toast/realtime work that surfaced it.
