# Multi-tenant SaaS — ideation in progress

**RESTORE POINT — 2026-07-28, step 2a shipped, starting step 2b.** Step 1a and
2a are both done (see table below). Praveen chose to build multi-EVENT support
before multi-tenant provisioning (reversing the original order) — see
"Order change" below. Read this plus `ARCHITECTURE.md` to pick up cold.

The one-line summary: the app works, but it assumes a single customer running a
single event. This is the plan to add the two layers above committees that turn
it into a product, and the open question that stopped us.

---

## The vision (locked)

```
Company (tenant)      unique globally; platform staff create these MANUALLY
  └── Event           name/slug unique WITHIN a company; the central workspace
        └── Committee unique WITHIN an event
              └── tasks, chat, files, folders, lists, program   (all already built)
```

Decided and not up for re-litigation:

| Decision | Value |
|---|---|
| Top-level entity is called | **Company** |
| Middle layer is called | **Event** (not Project) |
| Committees reference | **`event_id`**, never the event name |
| New companies are created by | **platform staff, manually** — no self-serve signup |
| Admin gets access via | **email invite link** |
| One person belongs to | **one company** |
| Attendees / registration | **parked** — not in scope, revisit much later |
| Vendors at company vs event level | **parked** — not needed to decide yet |
| Billing / Stripe | **deferred** until a 2nd customer can onboard without SQL |
| Workflows | **deferred** — explicitly "next version" |

---

## Why this is affordable

Every table below `committees` (tasks, chat, files, folders, lists, comments,
program) already hangs off `committee_id`. And ~55 RLS policies route through
just three functions:

- `is_admin()`
- `is_committee_member(committee_id)`
- `is_committee_head(committee_id)`

Rewrite those three function **bodies**, leave their **signatures** alone, and
almost every policy keeps working while silently becoming company-scoped. Only
~10 policies that call `is_admin()` directly on a shared table need editing.

**Storage needs no migration.** Paths are `${committeeId}/...` and committee ids
are uuids, so they are already globally unique across any number of companies.

---

## Agreed step order

Each step is verifiable before the next begins.

| Step | What | Status |
|---|---|---|
| 1a | `companies` + `company_members` + role functions + backfill existing users into company #1 | **DONE 2026-07-27** — `supabase/companies.sql` run successfully |
| 2a | `events` table + `committees.event_id` + unique-constraint fixes + real cross-tenant isolation fix | **DONE 2026-07-28** — `supabase/events.sql` run successfully, see below |
| 2b | Create-event UI + event switcher in nav | **in progress**, started 2026-07-28 |
| 1b | `/platform` provisioning UI — create company, assign admin, copy invite link | deferred — see "Order change" below |
| 3 | Platform console — monitor all companies/events | not started |

**Order change, decided 2026-07-28:** Praveen asked to build multi-event
support before multi-tenant provisioning, reversing the original 1b-then-2a
order above. Rationale he gave: get his one real company fully working across
multiple events first; a second company can wait since it's still stuck on
one event until 2a/2b land anyway. Also decided same session: company admins
run every event in their company with no new role table (Option A from "THE
OPEN QUESTION" below) — closes that question, don't re-litigate it.

---

## Step 2a — DONE 2026-07-28

`supabase/events.sql` run successfully (after one fix mid-development, see
below — never actually failed against Praveen's live DB, caught first). Adds:

- **`events` table**, scoped to `company_id`, with its own name/dates/status.
- **`committees.event_id`** and **`program_days.event_id`** — backfilled
  every existing row into one "Default Event" inside "Default Company".
  Verified: 14 committees + 2 program days landed in it, 0 orphans.
- **`committees.slug`** and **`program_days.day_number`** moved from globally
  unique to unique-**within-event** — problem #2 from the "Real problems
  found" list below, now fixed.
- **The real fix**: `is_committee_member()` / `is_committee_head()` previously
  granted access to a committee to ANY company admin, without checking that
  the committee's company matched the admin's own company — invisible with
  one company, but a real cross-tenant leak the moment a second company
  exists. Rewrote both (same name/signature, so every downstream table that
  already calls them — tasks, chat, files, folders, lists, comments — is
  fixed for free, same trick `companies.sql` used for `is_admin()`). Also
  fixed 3 RLS policies that called bare `is_admin()` directly (committees
  select, committee_members select, tasks select) — same class of leak, one
  level up. `program_days`/`program_sessions` visibility also narrowed from
  "any signed-in user, any company" to "member of that event, or admin of its
  company."
- New helper functions: `is_event_admin(event_id)` (company admin of that
  event's company) and `is_event_member(event_id)` (event admin, or sits on
  one of the event's committees).

**One bug caught before it reached the live DB** (Praveen ran it once, hit
`42703: column c.event_id does not exist` at line 95, reported it, fixed
before re-running): the file originally created `is_event_member()` (which
references `committees.event_id`) in an earlier section than the one that
adds the `event_id` column. `language sql` functions are validated against
the schema at creation time, not lazily at call time, so this failed
immediately. Fixed by moving "add `event_id` + backfill + constraints" before
"create functions that reference it" — pure reordering, no logic changed.
**Lesson for any future migration file**: when a new function references a
column being added in the same file, the column-adding section must run
first, checked in file order, not just checked for existing at all.

Verified end to end: backfill counts confirmed via SQL, then Praveen
click-tested the live app (admin nav, committee workspace, `/programs`,
`/admin-committees`, `/admin-users`) — all functional, nothing changed
visibly, as intended.

**Now in progress — step 2b**: create-event UI + event switcher in nav. See
the spec once written for exact scope.

---

`supabase/companies.sql` ran clean on 2026-07-27 after two fixes made mid-run
(see below). Verified: one company ("Default Company") with 18 members backfilled
(4 admin, 13 member, 1 owner), 0 profiles left behind, exactly 1 owner. App
click-tested afterward — admin nav, committee workspace, `/admin-users`,
`/programs` all unchanged, confirming the `is_admin()` rewrite didn't break the
~55 policies that call it. To roll back, see section 7 of that file.

**Two bugs fixed in `companies.sql` during this run, both now baked in:**
1. `guard_company_member_role()` blocked the backfill's own owner-assignment
   with "Only platform staff may assign the owner role" — the trigger checked
   `is_platform_staff()` via `auth.uid()`, which is null when SQL runs directly
   in the Supabase SQL Editor (no app session). Fixed by trusting
   `auth.uid() is null` the same as platform staff, since only someone with DB
   credentials can reach the editor anyway.
2. Section 6 (realtime registration) was written as SQL-in-a-comment, meant to
   be copy-pasted separately — got run literally against a table that didn't
   exist yet after the first (failed) attempt rolled back. Now runs
   automatically inside the file as a wrapped `do $$ ... exception when
   duplicate_object then null; end $$` block, safe to re-run.

---

## THE OPEN QUESTION — how users map — RESOLVED 2026-07-28: Option A

Praveen chose **Option A** (below) — company admins run every event in their
company, no new table. Kept for context/history; do not re-litigate.

A user has to answer three separate things. Today they are tangled:

| Question | Where it lives now |
|---|---|
| Who is this person? | `profiles` — one row per Google login |
| Who do they work for? | **nowhere — this is the gap** |
| What do they do on this event? | `committee_members` (volunteer / head) |

Note rows 1 and 3 are already fine. `profiles` is identity and should not
change; `committee_members` already works. We are inserting one layer, not
redesigning users.

**"All current users are relevant to this event" is currently only implied.**
There is one event, so everyone in `profiles` belongs to it by default and
nothing records that fact. With two companies that assumption silently becomes
"everyone belongs to everything" — the leak. The backfill just writes down what
is already true.

### The actual undecided thing

Concrete case. Acme runs a Tech Conf in March and a Gala in September.

- Priya works only on Tech Conf, on Food.
- Raj works on both.

Do we need a table saying "Priya is in Tech Conf"? **Probably not** — she is on a
Tech Conf committee, so her committee memberships already *are* her event list.
No new table needed.

Where it breaks: someone who **runs** the Gala end to end — sees every
committee, assigns the heads — but sits on no single committee. Today the only
way to say that is company admin, which gives them *both* events.

**Option A — company admin runs events (recommended for now)**
```
profiles          who they are
company_members   company + owner/admin/member
committee_members committee + head/volunteer

Priya -> Acme, member -> Food (Tech Conf)          = in Tech Conf
Raj   -> Acme, member -> AV (Tech Conf), AV (Gala) = in both
Meera -> Acme, admin                               = runs everything
```
No new table. Cannot express "runs only the Gala". Addable later without
touching anything that exists.

**Option B — add event-level roles now**
```
event_members     event + admin/organizer/staff    <- NEW table
```
Matches the original "assign a super admin for the event" wording. Costs a
table, policies, and an assign-to-event UI that cannot be meaningfully tested
while there is only one event.

**Unanswered, and the better way in:** describe a real person joining — the
customer hires someone to run the food committee. Who adds them? What do they
see on first login? Work backwards from that to the schema rather than picking
a model in the abstract.

---

## Real problems found while planning (independent of the above)

1. **`supabase/vendors.sql` is an empty shell.** 65 lines of comments only — no
   `create table`, no policies, no FK. The `vendors` table is created *nowhere*
   in any SQL file. So `/vendors` (5 query sites) and `FolderBrowser`'s
   vendor-link dropdown are querying a table that does not exist.
   `committee_files.vendor_id` exists as a bare uuid from
   `folder_management.sql:158` but was never made a real foreign key.
   `ARCHITECTURE.md` describes this table in confident detail — that description
   was never written to the file. Confirm with
   `select count(*) from public.vendors;` (expect "relation does not exist").
   **Needs rewriting from scratch.** Isolated to vendors —
   `volunteer_create_tasks.sql` is fine.

2. **`committees.slug` is globally unique** (`schema.sql:180`). Two events both
   wanting a "food" committee collide with a duplicate-key error. Must become
   unique per event. One-line fix, but a hard blocker for event #2.

3. **`program_days` has `unique (day_number)` globally and no scoping column,**
   with the policy *"Any authenticated user can view program days"*. So only one
   event in the entire system could ever have a "Day 1", and every company would
   see every other company's agenda.

4. **`profiles` leak** — `schema.sql:447` *"Authenticated users can view all
   profiles"* lets any logged-in user read every other user's name and email.
   Harmless with one customer; a real leak on day one of customer #2.
   `companies.sql` as written does **not** fix this — it was scoped out to keep
   the file small, which was the wrong call. It belongs in step 1.

5. **No email provider exists.** Only `web-push` is installed; no SMTP, no Resend
   or similar. So the invite-email decision cannot be honoured yet — step 1b must
   generate a **copyable invite link** and email can layer on later.

6. **`is_admin()` has been replaced twice already** — `schema.sql` then
   `soft_delete_users.sql`. Any new version must keep the `is_deleted_user()`
   check from the latter. If `soft_delete_users.sql` is ever re-run, the tenancy
   version must be re-run after it or admin silently reverts to global.

---

## Risk to weigh before starting

There is a **real customer with a real conference**, and its date was never
established. This work moves the foundation under a live event. If the
conference is weeks away, the honest call is: fix vendors, click-test what
shipped, run their event, then start this the day after. If it is months out,
now is the cheapest this migration will ever be — the backfill is one company
today and a migration project at twenty.

---

## Also still outstanding from before this ideation

- Folders, vendors and volunteer-task-creation were **never browser
  click-tested** — typecheck/lint/build only.
- Unread chat badge shows no count (deferred; see ARCHITECTURE.md "Open
  issues"). Leading theory: single-account testing, since own messages are
  excluded by design.
- Suggested cleanup when tenancy lands: delete the pre-migration stubs
  `/organizer`, `/speaker`, `/committee-portal` rather than carrying them
  through. `/events` and `/events-management` become real in step 2b.
