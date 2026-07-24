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
`committee_lists`, `committee_list_columns`, `committee_list_rows`.
All RLS-protected. SQL is delivered as files for the user to run manually in
Supabase SQL Editor — never run migrations against the live DB directly (see
memory `feedback_sql_migrations`).

**`supabase/enable_realtime.sql`** (added 2026-07-24, not yet run as of last
check) — adds `profiles`, `committee_members`, `tasks`, `committee_messages`,
`committee_list_rows`, `committee_list_columns` to the `supabase_realtime`
publication. Without this, `postgres_changes` subscriptions in the client
connect but never receive events — every live-update feature is silently
inert until this is run. Confirm it's been run by checking:
`select tablename from pg_publication_tables where pubname = 'supabase_realtime';`

## Realtime channels (client-side subscriptions)
- `committee/[id]/page.tsx` → channel `committee-${id}`: `tasks`,
  `committee_members`, `committee_messages` (filtered by `committee_id`).
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
- `enable_realtime.sql` needs to be run by the user before realtime features
  actually work end-to-end (verify, don't assume it's done).
- npm audit reports pre-existing high/critical vulns in `next`/`postcss`
  (via transitive deps) — flagged, not fixed, since upgrading Next is a
  separate decision from the toast/realtime work that surfaced it.
