# Spec: Folder Management (Documents)

Status: ready to implement
Author: architect pass, 2026-07-25
Read `ARCHITECTURE.md` first. This spec assumes its conventions and does not repeat them.

## Goal

Replace the flat per-committee file list with Google-Drive-style nested folders,
plus a new top-level **Documents** section. Folders are owned by a committee and
can optionally be shared with every signed-in member of the event.

## Decisions already made — do not re-litigate

| Decision | Why |
|---|---|
| Folders are **rows with `parent_id`**, not storage path prefixes | Drive-style, not S3-style. Renaming a folder must not rewrite storage paths. |
| **Storage paths never encode folder names** — keep `<committee_id>/<timestamp>-<filename>` exactly as today | Makes rename/move a single UPDATE. Also keeps the existing storage RLS working (it reads committee_id from path segment 1). |
| Folders are **committee-owned** | Inherits `is_committee_member()` / `is_committee_head()`. A global tree would need a second permission model. |
| Sharing is set **per folder**; files inherit from their folder | One place to reason about access. |
| "Shared with everyone" = **all signed-in members**. Never public links. | Invoices and contracts must never be reachable without auth. The bucket stays private. |
| Shared folders are **read-only to non-members** | One clear owner per folder. |
| **Non-empty folders cannot be deleted** | Real customer, real event. Losing a document to a misclick is unacceptable. |
| Drag-to-**upload** is in scope. Drag-to-**move** is not. | Drop-to-upload is browser-native and cheap. Drag-to-move needs a DnD lib and is fiddly on touch. |
| `doc_type` dropdown is in scope | Nearly free now, miserable to retrofit onto hundreds of files later. |
| `vendor_id` column added but **unused** | Vendor management is on the roadmap. One nullable column now = no migration later. |

## Terminology — use these exact strings in UI copy

- "Shared with everyone" / "This committee only" — **never** the word "public".
- Prefer neutral words ("folder", "group") over "committee" in generic components
  where it reads just as well. A classroom variant of this product has been floated;
  this costs nothing and keeps the option open.

## Database

`supabase/folder_management.sql` is **already written** by the architect. Do not
write, edit, or run SQL. Read it to understand the shape. Summary:

- `committee_folders (id, committee_id, parent_id, name, visibility, created_by, created_at)`
  - `visibility` is `'committee' | 'everyone'`
  - unique on `(committee_id, parent_id, lower(name))` — no duplicate sibling names
  - trigger blocks cycles (a folder cannot become its own ancestor) and depth > 10
- `committee_files` gains `folder_id uuid null`, `doc_type text null`, `vendor_id uuid null`
  - `folder_id null` = committee root. Root is always committee-only.
- `folder_is_shared(uuid)` / `file_is_shared(text)` helpers (security definer)
- storage.objects SELECT policy widened so shared files are downloadable by any
  authenticated user. INSERT/DELETE stay members-only.
- `doc_type` allowed values: `invoice`, `contract`, `receipt`, `template`, `reference`, `other`

## Files to change

### 1. NEW `src/lib/folders.ts`

Pure helpers, no React. Export:

```ts
export type FolderVisibility = 'committee' | 'everyone';
export type DocType = 'invoice' | 'contract' | 'receipt' | 'template' | 'reference' | 'other';
export interface Folder { id, committeeId, parentId, name, visibility, createdBy, createdAt }
export const DOC_TYPES: { value: DocType; label: string }[]   // for the dropdown
export function buildBreadcrumbs(folders: Folder[], folderId: string | null): Folder[]
export function childrenOf(folders: Folder[], parentId: string | null): Folder[]
```

`buildBreadcrumbs` walks up via `parentId` and returns root-first. It MUST guard
against a malformed cycle by capping iterations at 20 and returning what it has —
do not risk an infinite loop in a render path.

### 2. NEW `src/components/FolderBrowser.tsx`

The reusable browser. Used by BOTH the committee page and the Documents page, so
it must not assume it is inside a committee workspace.

Props:
```ts
{
  committeeId: string;
  canManage: boolean;     // create/rename/delete folders, move files
  canUpload: boolean;     // upload into folders
}
```

Behaviour:
- Loads folders + files for the committee on mount.
- One folder level shown at a time (Drive-style), with breadcrumbs above.
- Folders listed before files, both alphabetical.
- Each folder row: icon, name, a "Shared" pill when `visibility === 'everyone'`,
  and (when `canManage`) rename + delete buttons.
- Each file row: name, size, uploaded-by, date, doc-type pill, download button,
  and (when `canManage`) a move control + delete.
- **New folder** button when `canManage`. Inline input, not a modal — matches the
  existing add-task pattern.
- **Upload** when `canUpload`: file input AND drag-drop onto the file list area.
  Show a visible drop-target highlight on dragover. Uploads land in the folder
  currently being viewed.
- Upload dialog includes the doc-type dropdown (optional, defaults to unset).
- Deleting a folder with any child folder or file: block it, and show the count —
  e.g. "This folder has 12 items. Move or delete them first." Do NOT offer a
  cascade option.

Follow `ARCHITECTURE.md` conventions exactly:
- Toast only after the write resolves. Never per keystroke.
- Rename uses the per-row edit pattern (pencil → editable → Save/Cancel).
- Realtime: subscribe to `committee_folders` and `committee_files` filtered by
  `committee_id`, on channel `folders-${committeeId}`.
- Mobile-first Tailwind. No un-prefixed multi-column grids. Tap targets >= p-2.

### 3. EDIT `src/app/committee/[id]/page.tsx`

Replace the flat files panel with `<FolderBrowser>`.

- Existing handlers `handleUpload` (line ~558), `downloadFile` (~587), `deleteFile`
  (~591) move into FolderBrowser. Delete them from this file.
- `canManage={isHead}`, `canUpload={isCommitteeMember(committeeId)}`.
- Keep the storage path format `${committeeId}/${Date.now()}-${file.name}` UNCHANGED.
- Do not touch the chat, tasks, comments, or realtime code in this file. The chat
  incremental-append path in particular is easy to break — leave it alone.

### 4. EDIT `src/components/Navigation.tsx`

Add a Documents nav item after Program (line ~11-14):

```ts
const DOCUMENTS_NAV_ITEM = { href: '/documents', label: 'Documents', icon: FolderOpen,
  match: (p: string) => p.startsWith('/documents') };
```

Import `FolderOpen` from lucide-react. Add to `navItems` on the same condition as
`COMMITTEE_NAV_ITEM` (`isAdmin || committeeRoles.length > 0`) — someone with no
committees has nothing to see. It appears in BOTH the desktop nav and the mobile
tab bar automatically because both map over `navItems`.

### 5. NEW `src/app/documents/page.tsx`

Top-level Documents section.

- Lists committees the viewer can see: their own committees, or all if `isAdmin`.
- Selecting one renders `<FolderBrowser>` for it, with the same permission props
  the committee page would use (`canManage` = head of that committee or admin).
- Also a "Shared with everyone" section listing folders where
  `visibility = 'everyone'` across all committees — read-only, showing which
  committee owns each.
- Empty state when the viewer belongs to no committees.

## Acceptance criteria

Verify each before reporting done:

1. `npx tsc --noEmit` passes.
2. `npx next lint` passes with no new warnings.
3. `npm run build` succeeds.
4. Creating a folder, renaming it, and creating a nested child all work in the UI.
5. Deleting an empty folder works; deleting a non-empty one is blocked with a count.
6. Uploading via the button and via drag-drop both land in the current folder.
7. A file can be moved between folders and the storage path does NOT change.
8. Breadcrumbs navigate correctly at 3 levels deep.
9. The Documents nav item appears in both desktop nav and mobile tab bar.
10. Nothing in the chat / task / comment paths changed — `git diff` on
    `committee/[id]/page.tsx` touches only the files panel and its handlers.

## Out of scope — do not build

Drag-to-move between folders; folder-level per-user permissions; Google Drive /
Dropbox import; global full-text search; file version history; invoice amount /
vendor / date fields; spend rollups; OCR; e-signing; approval workflows; archive
export; public share links.

## Hard constraints

- **Do not create, edit, or run any `.sql` file.** SQL is delivered separately for
  the user to run manually. If you believe the schema is wrong, say so in your
  report — do not fix it.
- **Do not run any command that writes to the database.**
- Do not upgrade, add, or remove npm dependencies. No DnD library.
- Do not change the storage bucket name or the storage path format.
- Do not refactor unrelated code you happen to read.
