# Spec: Vendor Management

Status: ready to implement
Author: architect pass, 2026-07-25
Read `ARCHITECTURE.md` first. This spec assumes its conventions and does not repeat them.
Read `specs/folder-management.md` for the house spec style and the FolderBrowser
component you will reuse patterns from.

## Goal

A shared directory of every supplier the event deals with — caterer, printer, AV,
hotel, florist — with contact details, relationship status, and a link through to
that vendor's invoices and contracts.

## Decisions already made — do not re-litigate

| Decision | Why |
|---|---|
| Vendors are **event-wide**, not committee-owned | A caterer serves the event. Per-committee lists produce the same vendor entered three times with three different phone numbers. |
| **Everyone signed in can view** the whole directory | The point is that Food can see Travel already has a hotel deal. Hiding vendors recreates the WhatsApp silo problem. |
| **Heads and admins** create and edit; **admins only** delete | Heads are the ones talking to suppliers. Making them wait on an admin to save a phone number sends them back to WhatsApp. |
| `owning_committee_id` is a **pointer, not a permission** | "Who do I ask about this vendor". It does not restrict visibility or editing. |
| `category` is **free text**, not an enum | Real events turn up vendors nobody predicted. A constraint that rejects "Ice sculptor" is a support ticket, not a safeguard. |
| Delete is a **real delete**, but UI steers to status instead | Vendors carry no history of their own. Their documents survive via `on delete set null`. |
| **No money fields** — no contracted amount, no payments, no spend rollup | Money tracking is its own product. Not smuggling accounting into a directory. |

## Database

`supabase/vendors.sql` is **already written** by the architect. Do not write, edit,
or run SQL. Read it to understand the shape. Summary:

- `vendors (id, name, category, contact_name, email, phone, website, notes,
  status, owning_committee_id, created_by, created_at, updated_at)`
  - `status` is `'potential' | 'active' | 'past' | 'rejected'`, default `potential`
  - unique index on `lower(trim(name))` — duplicate names are rejected by the DB
  - `updated_at` is maintained by a trigger; do NOT set it from the client
- `committee_files.vendor_id` becomes a real FK to `vendors(id)` on delete set null
- RLS: all authenticated read; head-or-admin insert/update; admin-only delete

**Duplicate-name handling matters.** The unique index means `insert` fails with a
Postgres unique-violation (code `23505`). Catch it and show
"A vendor called "<name>" already exists." — do not surface the raw Postgres error.

## Files to change

### 1. NEW `src/lib/vendors.ts`

Pure helpers, no React. Export:

```ts
export type VendorStatus = 'potential' | 'active' | 'past' | 'rejected';
export interface Vendor {
  id: string; name: string; category: string | null;
  contactName: string | null; email: string | null; phone: string | null;
  website: string | null; notes: string; status: VendorStatus;
  owningCommitteeId: string | null; createdBy: string | null;
  createdAt: string; updatedAt: string;
}
export const VENDOR_STATUSES: { value: VendorStatus; label: string; tone: string }[]
export const CATEGORY_SUGGESTIONS: string[]   // Catering, Printing, AV, Venue,
  // Accommodation, Transport, Photography, Florist, Security, Entertainment, Other
export function mapVendorRow(row: Record<string, unknown>): Vendor
export function normalizeWebsite(input: string): string
```

`tone` on each status is a Tailwind class string for the pill, matching how the
codebase already colours task status/priority pills — copy that convention.

`normalizeWebsite` prepends `https://` when the user typed a bare domain
(`acme.com` → `https://acme.com`), and returns '' unchanged for empty input.
Needed because `<a href="acme.com">` resolves as a relative path and 404s inside
the app — a real bug, not a nicety.

### 2. NEW `src/app/vendors/page.tsx`

The directory. Single page, no detail route.

- Loads all vendors, ordered by name.
- **Search box** filtering on name / category / contact name, client-side (the
  list is small; no need for a server query).
- **Status filter** — pills or a select for All / Potential / Active / Past / Rejected.
- Table-styled list, one row per vendor: name, category, status pill, contact
  name, phone, email, and a document count.
- **Per-row edit mode with explicit Save/Cancel** covering ALL fields including
  the status and owning-committee dropdowns. This is the house pattern — see
  `editingTaskId`/`draftTask`/`saveTaskEdit` in `committee/[id]/page.tsx`. Nothing
  writes until Save.
- **Add vendor**: inline form (not a modal), name required, everything else
  optional. Matches the existing add-task pattern.
- **Delete** (admins only): inline red confirm panel spelling out what happens —
  "Their documents will be kept but unlinked." Also point at the alternative:
  "Set status to Past or Rejected instead to keep the record."
- Email renders as `mailto:`, phone as `tel:`, website as an external link using
  `normalizeWebsite` with `target="_blank"` and `rel="noopener noreferrer"`.
- **Expandable row** revealing notes plus that vendor's linked documents
  (file name, doc type, which committee, download). Reuse the inline-expand
  pattern from task comments in `committee/[id]/page.tsx` (`expandedTaskId`).
- Realtime: subscribe to `vendors` on channel `vendors-directory`.
- Permissions from `useAuth()`: `canManage = isAdmin || committeeRoles.some(r => r.role === 'head')`.
  Verify the exact shape of `committeeRoles` in `auth-context.tsx` before using it.
- Non-managers see a read-only directory — no add button, no pencil, no delete.
- Empty state when there are no vendors.

### 3. EDIT `src/components/Navigation.tsx`

Add a Vendors nav item after Documents:

```ts
const VENDORS_NAV_ITEM = { href: '/vendors', label: 'Vendors', icon: Store,
  match: (p: string) => p.startsWith('/vendors') };
```

Import `Store` from lucide-react. Gate on the same condition as
`COMMITTEE_NAV_ITEM` and `DOCUMENTS_NAV_ITEM` (`isAdmin || committeeRoles.length > 0`).

**Mobile tab bar check:** this makes 5 tabs (Home, Program, Committees, Documents,
Vendors) plus Admin for admins = 6. Verify the bottom tab bar still works at
320px width. If labels collide, reduce the label font size or let the bar scroll
horizontally — do NOT drop items from the mobile nav, and do not hide Vendors on
mobile. Report what you did.

### 4. EDIT `src/components/FolderBrowser.tsx`

Add vendor linking to files.

- Load vendors (id + name only) on mount for the dropdown.
- The file row's edit affordance gains a **Vendor** dropdown — "No vendor" plus
  each vendor by name.
- Show a small vendor name pill on file rows that have one.
- Treat it exactly like the existing doc-type/move controls, following whatever
  save pattern those already use in this file — read it and match, do not invent
  a third pattern.
- If no vendors exist yet, the dropdown shows a disabled "No vendors yet" option.
  Do not hide the control.

## Acceptance criteria

Verify each before reporting done:

1. `npx tsc --noEmit` passes.
2. `npx next lint` passes with no new warnings.
3. `npm run build` succeeds.
4. Add, edit, and delete a vendor all work; Cancel discards with no write.
5. Adding a duplicate name shows the friendly message, not a Postgres error.
6. Search and status filter both narrow the list.
7. A file can be linked to a vendor in FolderBrowser, and that file then appears
   under the vendor's expanded row.
8. A user who is neither admin nor any committee head sees a read-only directory.
9. Vendors appears in both desktop nav and mobile tab bar, and the mobile bar is
   still usable at 320px.
10. Website links open externally and work for a bare domain like `acme.com`.

## Out of scope — do not build

Contracted amounts; payment or deposit tracking; spend rollups or budget
comparison; quote comparison; vendor ratings/reviews; multiple contacts per
vendor; vendor portal or external logins; email-the-vendor-from-the-app;
contract expiry reminders; import from CSV; per-vendor document upload
(documents are linked from FolderBrowser, not uploaded from the vendor page).

## Hard constraints

- **Do not create, edit, or run any `.sql` file.** SQL is delivered separately for
  the user to run manually. If you think the schema is wrong, say so in your
  report — do not fix it.
- **Do not run any command that writes to the database.**
- Do not add, remove, or upgrade any npm dependency.
- Do not set `updated_at` from client code — a DB trigger owns it.
- Do not touch the chat, task, or comment code in `committee/[id]/page.tsx`.
- Do not refactor unrelated code you happen to read.
- Never use localStorage as a source of truth.
