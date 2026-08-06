# Event Platform — Architecture Checkpoint

Read this before re-exploring the codebase. Update it whenever a structural
change is made (new table, new page, new realtime channel, new auth rule).
Last updated: 2026-07-28.

## Multi-tenancy (Company > Event > Committee) — added 2026-07-27/28
The app is becoming a multi-tenant SaaS. Full history/rationale lives in
`MULTI_TENANT_PLAN.md` — read that first for anything tenancy-related.
- **`companies` + `company_members`** (`supabase/companies.sql`, run
  2026-07-27) — the tenant layer. `is_admin()` is now company-scoped (same
  signature). One person belongs to one company.
- **`events` + `committees.event_id` + `program_days.event_id`**
  (`supabase/events.sql`, run 2026-07-28) — the event layer between company
  and committee. `committees.slug` and `program_days.day_number` are now
  unique **per-event**, not globally. `is_committee_member()` /
  `is_committee_head()` are now correctly scoped to the committee's own
  company (previously any company admin could reach any committee — fixed
  here). New helpers: `is_event_admin(event_id)`, `is_event_member(event_id)`.
- Currently exactly one company ("Default Company") and one event ("Default
  Event") exist — everything backfilled cleanly, app click-tested working.
- **Not yet built**: create-event UI / event switcher (step 2b, in progress),
  company provisioning UI (step 1b, deferred until after 2b).
- **Still open, independent of tenancy**: `profiles` policy leaks every
  user's name/email across companies (not fixed by either migration —
  scoped out both times to keep files small); `vendors.sql` is still an
  empty shell (see "Vendor management" below).

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

**`supabase/chat_reads.sql`** (added + CONFIRMED RUN 2026-07-24, but the badge it
feeds is still not showing a count — see Open issues) — `committee_chat_reads (user_id,
committee_id, last_read_at)`, PK on `(user_id, committee_id)`. Stores when each
person last had a committee's chat panel open, so the chat bubble can show a
real unread count instead of a lifetime message total. RLS is own-rows-only for
select/insert/update — deliberately NOT readable by heads/admins ("has X read
this?" is surveillance, not coordination). Writes go through
`mark_committee_chat_read(uuid)` (security invoker, so RLS still applies) rather
than a client-side timestamp, because a device with a fast clock would otherwise
mark not-yet-arrived messages as read; the function uses `now()` (server clock)
and `greatest(...)` so read position is monotonic and can't be rewound by an
out-of-order request. **Degrades gracefully if unrun**: the load query returns
null, `lastReadAt` stays null, and every message from another person counts as
unread — i.e. roughly the old total-count behaviour, no crash.

**`supabase/soft_delete_users.sql`** (added + CONFIRMED RUN 2026-07-24; delete
and restore both click-tested working) — adds
`profiles.deleted_at` + `deleted_by` for soft-deleting users from
`/admin-users`. Hard delete was rejected: profiles are FK'd from tasks and
messages, so removing the row turns event history into "Unknown".
**IMPORTANT — this file rewrites `is_admin()`, `is_committee_member()` and
`is_committee_head()`** to return false for a deleted user, which is what makes
deletion actually revoke access everywhere (every other policy in the app is
built on those three). If admin access breaks after running it, this is the file
to look at. Also adds `is_deleted_user()`, plus `soft_delete_user(uuid)` /
`restore_user(uuid)` RPCs (security definer, any admin may call; they reject
deleting yourself or either hardcoded super-admin email, and do the stamp +
membership-strip + role-reset in one transaction). Restore does NOT bring back
committee roles — they aren't stored anywhere, so re-assign manually.

**`supabase/task_comments.sql`** (added + CONFIRMED RUN 2026-07-24; commenting
click-tested working) —
`task_comments (id, task_id, author_id, body, created_at)` + helper
`task_committee_id(uuid)`. View/insert = any committee member of the task's
committee (deliberately not restricted to head/assignee — it's a two-way note);
delete = author or head; no UPDATE policy, so comments are immutable like chat
messages. Note the reason it's a table and not a `tasks.notes` column: the
`guard_task_update()` trigger reverts every non-`status` column for non-head
assignees, so a notes column would be un-writable by exactly the volunteers who
need it.

**`supabase/enable_realtime.sql`** (added 2026-07-24, CONFIRMED RUN
2026-07-24) — adds `profiles`, `committee_members`, `tasks`,
`committee_messages`, `committee_list_rows`, `committee_list_columns` to the
`supabase_realtime` publication. **Gained `committee_chat_reads` and
`task_comments` on 2026-07-24 — re-run it after `chat_reads.sql` and
`task_comments.sql`** so read-state syncs across a user's devices and two people
on the same task see each other's comments live. Verified present via
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
- `FolderBrowser.tsx` (used by both `committee/[id]/page.tsx` and
  `/documents`) → channel `folders-${committeeId}`: `committee_folders`,
  `committee_files` (filtered by `committee_id`) (added 2026-07-25).
- `/vendors` → channel `vendors-directory`: `vendors`, unfiltered (added
  2026-07-25).
- All depend on `enable_realtime.sql` having been run — `committee_folders`
  additionally needs `alter publication supabase_realtime add table
  public.committee_folders;` (see the bottom of `folder_management.sql`), and
  `vendors` needs the equivalent `alter publication ... add table
  public.vendors;` (see the bottom of `vendors.sql`).

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

## Chat launcher bubble + unread badge — added 2026-07-24
The committee workspace's old header "Chat" button was replaced by an
**always-visible 64px floating bubble** in the bottom-right of
`committee/[id]/page.tsx` (rendered just before the chat panel block). It
toggles: `MessageSquare` icon when closed, `X` when open. `z-[60]` puts it above
both the panel (`z-50`) and the nav (`z-50`); the mobile bottom offset
`bottom-[calc(72px+env(safe-area-inset-bottom))]` clears the tab bar.
- Because the bubble is always present on desktop, the **panel was moved up** to
  `md:bottom-28` so it doesn't cover it. The panel's breakpoints were also
  changed `sm:` → `md:` to match the bubble's, so the docked-card and
  full-screen-sheet layouts switch at the same width the bubble repositions at.
  On mobile the bubble is hidden while open (`max-md:hidden`) since the panel is
  full-screen there — closing is via the header X.
- **Badge is a true unread count**, not a message total: `unreadCount` (useMemo)
  counts messages where sender ≠ me and `createdAtIso > lastReadAt`, excluding
  `pending`/`failed` optimistic bubbles. Bubble is purple when unread > 0, slate
  grey otherwise. `ChatMessage` gained a `createdAtIso` field (raw server
  timestamp) alongside the pre-existing display-formatted `createdAt` — set it
  in all three places a `ChatMessage` is constructed (initial load, realtime
  insert, optimistic send).
- Read state is stamped by an effect keyed on
  `[showChat, committeeId, profile, supabase, messages.length]` calling
  `supabase.rpc('mark_committee_chat_read')`. It early-returns when
  `document.hidden` so a backgrounded tab left open doesn't mark messages read
  that nobody saw. Failures are silent by design.
- Requires `supabase/chat_reads.sql` (see above).

## User soft delete + task comments — added 2026-07-24
- **Delete on `/admin-users`** (`src/app/admin-users/page.tsx`): trash icon per
  row → an inline red confirm panel spelling out what happens (access gone, off
  N committees, history kept, restorable) → `soft_delete_user` RPC. Removed
  users are hidden behind a "Show removed (N)" toggle rather than dropped from
  the page, and render greyed with a Restore button. The button is not rendered
  for super-admins or for yourself (the RPC also rejects both). Profile rows are
  typed locally as `ManagedProfile = Profile & { deleted_at }` — the shared
  `Profile` type in `rbac.ts` does not model the soft-delete columns.
- **`src/middleware.ts` now checks `deleted_at`** on every non-public request
  and signs out + redirects to `/auth/login?error=account_removed`. Without
  this, a deleted user holding a live session cookie could still load page
  shells; the login page renders a message for that error code. This adds one
  `profiles` select per request — the obvious optimisation later is to fold it
  into the session/JWT claims instead.
- **Task comments** live inline in `committee/[id]/page.tsx`, NOT in a drawer
  (user chose inline). A `MessageSquare` button with a count sits in each task
  row's action cell; clicking sets `expandedTaskId`, unfolding a thread on a
  grey background directly beneath that row. `renderTaskRow`'s read-only branch
  is now wrapped in an outer `<div key={task.id}>` holding both the row and the
  thread — the grid row itself no longer carries the key.
- All of a committee's comments load up front in `loadEverything` (one `.in()`
  query over the committee's task ids) so per-row counts are accurate without a
  query per row. Posting is optimistic with temp ids + pending/failed states,
  copying the chat pattern; delete is optimistic with a snapshot rollback.
- Realtime: the comments binding on channel `committee-${id}` is **unfiltered**
  (`task_comments` has no `committee_id`), so the handler drops rows whose
  `task_id` isn't in `taskIdsRef` — a ref, so the channel never re-subscribes
  when tasks change.

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

## Folder management (Documents) — added 2026-07-25
Replaces the old flat per-committee file list with Google-Drive-style nested
folders, plus a top-level `/documents` section. Spec: `specs/folder-management.md`.
Schema: `supabase/folder_management.sql` — **CONFIRMED RUN 2026-07-25** by the
user in the Supabase SQL Editor. Note this file **replaced** the storage.objects
SELECT policy from `schema.sql` (~line 596) with "View committee files and shared
files"; if file downloads ever break, that is the policy to look at.
**Not yet browser click-tested** — typecheck/lint/build pass only.
- **`committee_folders (id, committee_id, parent_id, name, visibility,
  created_by, created_at)`** — a folder is a real row with a `parent_id`, not a
  storage path prefix, so renaming/moving never rewrites storage paths.
  `visibility` is `'committee'` (default) or `'everyone'`; UI copy says "This
  committee only" / "Shared with everyone" — never "public". A DB trigger
  blocks cycles and caps nesting at 10 levels.
- **`committee_files` gained `folder_id` (null = committee root), `doc_type`**
  (`invoice | contract | receipt | template | reference | other`, optional)
  **and `vendor_id`** (nullable — became a real FK once `vendors.sql` ran, see
  "Vendor management" below).
- **Storage path format is unchanged**: `${committeeId}/${Date.now()}-${file.name}`.
  Folders are purely a database concept; moving a file between folders is a
  single `UPDATE committee_files SET folder_id = ...`, never a storage
  copy/move. This is also why the storage bucket's SELECT policy (in the same
  SQL file) had to be widened separately from the `committee_files` table
  policy — Storage doesn't know about folders, only about `file_is_shared()`.
- **`src/lib/folders.ts`** — pure helpers (`buildBreadcrumbs`, `childrenOf`,
  `DOC_TYPES`). `buildBreadcrumbs` caps at 20 hops so a malformed cycle can't
  hang a render.
- **`src/components/FolderBrowser.tsx`** — the reusable Drive-style browser
  (one level shown at a time + breadcrumbs), used by both
  `committee/[id]/page.tsx` (files panel, replacing the old flat list) and
  `/documents`. Props: `committeeId`, `canManage` (create/rename/delete
  folders, move files — heads/admins), `canUpload` (committee members).
  Drag-and-drop is upload-only (native HTML5 drag events, no DnD library) —
  drag-to-*move* between folders is explicitly out of scope. New-folder and
  rename both use the per-row Save/Cancel pattern below, not a modal. Deleting
  a non-empty folder is blocked client-side with an item count (mirrors the DB
  `on delete restrict` on `parent_id`).
- Realtime: channel `folders-${committeeId}` on `committee_folders` and
  `committee_files`, filtered by `committee_id`.
- **`/documents`** (`src/app/documents/page.tsx`) — lists the committees the
  viewer belongs to (or all, if admin), renders `FolderBrowser` for whichever
  one is selected, plus a read-only "Shared with everyone" section querying
  `committee_folders` where `visibility = 'everyone'` across every committee.
- **Nav**: `Documents` added to `navItems` in `Navigation.tsx` on the same
  condition as `Committees` (`isAdmin || committeeRoles.length > 0`) — appears
  in both the desktop nav and the mobile tab bar automatically.

## Vendor management — added 2026-07-25
A shared, event-wide supplier directory (caterer, printer, AV, hotel,
florist) — replaces per-committee WhatsApp threads and phone contacts.
Spec: `specs/vendor-management.md`. Schema: `supabase/vendors.sql` —
**delivered as a file, NOT yet confirmed run by the user** (this pass was
UI-only per the task; typecheck/lint/build pass, but the table doesn't exist
in the live DB until that SQL is run in the Supabase SQL Editor). Run
`folder_management.sql` first if it hasn't been — `vendors.sql` depends on
the `committee_files.vendor_id` column it added.
- **`vendors (id, name, category, contact_name, email, phone, website, notes,
  status, owning_committee_id, created_by, created_at, updated_at)`** —
  event-wide, not committee-owned (`owning_committee_id` is nullable and is a
  "who do I ask" pointer, not a permission boundary). Unique index on
  `lower(trim(name))` — duplicate names are rejected by the DB with a
  Postgres unique-violation (code `23505`), which the UI catches and shows as
  "A vendor called "X" already exists." rather than the raw error.
  `updated_at` is trigger-maintained; never set from the client. `category`
  is free text with UI suggestions, not an enum.
- **RLS**: every authenticated (non-deleted) user can read the whole
  directory; heads-or-admins insert/update; admins-only delete (real delete,
  not soft — vendors carry no history of their own; their documents survive
  via `committee_files.vendor_id on delete set null`).
- **`src/lib/vendors.ts`** — pure helpers: `VendorStatus`, `Vendor`,
  `VENDOR_STATUSES` (pill tone strings, mirrors the task status/priority pill
  convention in `committee/[id]/page.tsx`), `CATEGORY_SUGGESTIONS`,
  `mapVendorRow`, `normalizeWebsite` (prepends `https://` to a bare domain
  like `acme.com` so `<a href>` doesn't resolve it as a relative in-app path).
- **`src/app/vendors/page.tsx`** — single-page directory, no detail route.
  Search (name/category/contact, client-side) + status filter. Per-row
  Save/Cancel edit mode (same `editingId`/draft/`startEdit`/`saveEdit`/
  `cancelEdit` pattern as `editingTaskId`/`draftTask` in
  `committee/[id]/page.tsx`) covers every field including status and owning
  committee. Add-vendor is an inline form, not a modal. Delete is admin-only
  behind an inline red confirm panel that also points at the status-change
  alternative. Expandable row (`expandedId`, same pattern as task comments'
  `expandedTaskId`) reveals notes plus that vendor's linked documents (joined
  by querying `committee_files` where `vendor_id is not null`, grouped
  client-side — small dataset, no per-vendor query). `canManage = isAdmin ||
  committeeRoles.some(r => r.role === 'head')`.
- **`FolderBrowser.tsx` gained a vendor-link dropdown** on each file row
  (heads/admins only, same single-field-saves-instantly pattern as the
  existing move-to-folder dropdown — not a Save/Cancel draft). Loads
  `vendors(id, name)` once on mount; shows a disabled "No vendors yet" option
  if the directory is empty rather than hiding the control. A small indigo
  pill shows the linked vendor's name on the file row.
- Realtime: channel `vendors-directory` on `vendors`, unfiltered (the table
  has no natural scoping column and the whole directory is visible to
  everyone anyway) — does a full silent reload rather than an incremental
  patch, since the list is small.
- **Nav**: `Vendors` added to `navItems` in `Navigation.tsx` on the same
  condition as `Documents`/`Committees`. This pushed the mobile bottom tab bar
  to 6 items for admins (5 for everyone else). Rather than drop/hide an item
  at 320px, each tab now uses `flex-1 min-w-0` with a truncating label and a
  slightly smaller icon/font (`h-5 w-5`, `text-[10px]`) so 6 tabs divide the
  width evenly without wrapping; the bar's outer container also gained
  `overflow-x-auto` as a fallback if a future 7th item still doesn't fit.

## Pages
- `/` — landing/home.
- `/committee/[id]` — main committee workspace: tasks, files (now folder-based,
  see above), chat, members.
- `/committee/[id]/lists` — index of spreadsheet-like lists for a committee.
- `/committee/[id]/lists/[listId]` — one list (dynamic columns/rows).
- `/documents` — top-level Documents section (see "Folder management" above).
- `/vendors` — event-wide vendor directory (see "Vendor management" above).
- `/admin-committees`, `/admin-users`, `/admin-templates` — admin management.
- `/admin` — admin dashboard landing.
- `/programs` — event-wide schedule (program days/sessions), admin-editable.
- `/committee-portal`, `/events`, `/events-management`, `/organizer`,
  `/speaker` — mostly legacy/stub pages from the pre-migration prototype, not
  the current production surface. `/events-management` and `/events` are
  known unimplemented stubs (deferred multi-event support).

## Volunteers can create tasks — added 2026-07-25
Previously only heads could create tasks, so a volunteer had nowhere to record
their own work (they had to ask a head, which in practice meant WhatsApp). Now
any committee member can. Schema: `supabase/volunteer_create_tasks.sql` —
**delivered as a file; must be run in the SQL Editor or the UI will offer an Add
Task button that fails RLS.** This deferred the planned "Todos" feature entirely.

**This file REPLACES `guard_task_update()`** from `schema.sql` (~line 330) and all
three write policies on `tasks`. If task editing misbehaves, look there first.
The resulting rules, which the UI must stay in step with:

| Task | Volunteer can change |
|---|---|
| They created it, unassigned or assigned to self | title, priority, due date, status; claim/release; delete |
| A head created it and assigned it to them | status only (unchanged from before) |
| Anyone else's | nothing — view only |

- Insert requires `created_by = auth.uid()` (no filing tasks under another
  person's name) and, for non-heads, `assignee_id` must be null or self.
- UI: `canAddTask` (line ~172) and `isMyOwnCreation`/`canEditFull`/`canEditStatus`
  in `renderTaskRow` (~line 740) of `committee/[id]/page.tsx`. `Task` gained
  `createdBy` and both task `select` queries now fetch `created_by` — the edit
  rules depend on it, so don't drop it from those selects.
- The assignee dropdown is filtered to just yourself for non-heads, because the
  DB reverts assigning to a third party and an option that silently does nothing
  is worse than no option.
- **KNOWN ROUGH EDGE (pre-existing, deliberately not fixed):**
  `guard_task_update()` *silently reverts* fields the caller may not change
  instead of raising — so an unauthorized edit shows a success toast and then
  snaps back with no explanation. Raising instead would break the status-only
  update path volunteers use daily. The real fix is UI-side (hide/disable those
  fields), which is why `canEditFull` gating matters.
- **Not browser click-tested.** Verify with a second Google account that is a
  volunteer (not head) — the test list is at the bottom of the SQL file.

## Open issues — unresolved, pick up here
- **Unread chat badge does not show a count (2026-07-24, DEFERRED by user after
  a long debugging session — resume here, don't re-litigate what's ruled out).**
  Code is in `committee/[id]/page.tsx` (`unreadCount` useMemo + the
  `mark_committee_chat_read` RPC effect); user confirmed both
  `supabase/chat_reads.sql` and the re-run of `enable_realtime.sql` completed.
  Typecheck/lint clean. Symptom: bubble stays slate grey with no number.
  - **Ruled out:** login/auth (working fine — an `AuthPKCECodeVerifierMissingError`
    seen in the dev log was an incidental half-finished flow from a port
    3001→3000 restart, NOT a regression); the SQL not having been run.
  - **Not yet checked — start here:** (1) whether `unreadCount` is 0 because
    every message in the tested committee was sent by the viewer (own messages
    are excluded by design, so single-account testing can never show a badge —
    this may be the whole answer); (2) whether the `committee_chat_reads` select
    in `loadEverything` errors silently — it has no error handling, so an RLS or
    404 failure would leave `lastReadAt` null with no console noise; (3) whether
    the mark-read effect is firing so aggressively (it's keyed on
    `messages.length`) that it stamps read before the badge can ever render;
    (4) whether `createdAtIso` is actually populated on the realtime-insert path.
  - Add a temporary console.log of `{messages.length, lastReadAt, unreadCount}`
    to settle (1)–(4) in one page load rather than guessing.

## Known gaps (not yet addressed)
- No automated test suite.
- npm audit reports pre-existing high/critical vulns in `next`/`postcss`
  (via transitive deps) — flagged, not fixed, since upgrading Next is a
  separate decision from the toast/realtime work that surfaced it.
