-- ============================================================================
-- Event Platform — SEED DATA: realistic tasks for each committee
--
-- PURPOSE: make the app look real for testing/demo. Adds ~4-5 tasks to each of
-- the 12 seeded committees, with a mix of statuses, priorities, and due dates
-- relative to today (so some are upcoming, some overdue) — no hardcoded dates.
--
-- HOW TO RUN
--   1. (Optional but recommended) back up first.
--   2. Paste into Supabase Dashboard → SQL Editor → Run.
--
-- SAFE TO RE-RUN: guarded so it won't duplicate. It only inserts a committee's
-- seed tasks if that committee currently has NO tasks. Delete the seed anytime
-- with the cleanup query at the bottom.
--
-- NOTE: tasks are left UNASSIGNED (assignee_id = null) on purpose — assign them
-- to real people from the committee task board once users exist. created_by is
-- also null (these weren't created by a real signed-in user).
-- ============================================================================

begin;

-- One INSERT per committee. Each uses `where not exists (any task for it)` so
-- re-running does nothing once a committee already has tasks.

-- Youth Conference
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Recruit youth track volunteers',        'in_progress', 'high',   3),
  ('Finalize youth workshop schedule',      'todo',        'medium', 7),
  ('Order youth welcome kits',              'todo',        'medium', 10),
  ('Confirm youth speaker line-up',          'review',      'high',   2),
  ('Set up youth registration desk',        'todo',        'low',    14)
) as v(title, status, priority, due)
where c.slug = 'committee_youth'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Award Committee
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Open award nominations',                'done',        'high',   -5),
  ('Shortlist award nominees',              'in_progress', 'high',   1),
  ('Design award trophies',                 'todo',        'medium', 12),
  ('Draft award ceremony script',           'todo',        'medium', 9),
  ('Confirm award presenters',              'blocked',     'urgent', -1)
) as v(title, status, priority, due)
where c.slug = 'committee_awards'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Speaker Coordination
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Send speaker invitations',              'done',        'high',   -7),
  ('Collect speaker bios and headshots',    'in_progress', 'medium', 4),
  ('Confirm keynote speaker travel',        'todo',        'high',   6),
  ('Brief speakers on session format',      'todo',        'low',    11)
) as v(title, status, priority, due)
where c.slug = 'committee_speakers'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Registration Committee
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Set up online registration form',       'done',        'high',   -3),
  ('Print attendee badges',                 'todo',        'medium', 8),
  ('Arrange check-in desk staffing',        'in_progress', 'medium', 5),
  ('Test badge scanning app',               'todo',        'high',   6),
  ('Prepare walk-in registration process',  'todo',        'low',    13)
) as v(title, status, priority, due)
where c.slug = 'committee_registration'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Website Communications
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Publish event agenda page',             'in_progress', 'high',   2),
  ('Update speaker profiles on site',       'todo',        'medium', 5),
  ('Set up online ticket links',            'todo',        'high',   4),
  ('Write pre-event email newsletter',      'todo',        'medium', 7)
) as v(title, status, priority, due)
where c.slug = 'committee_website'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Flyer Design
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Design main event poster',              'in_progress', 'high',   3),
  ('Create social media banners',           'todo',        'medium', 6),
  ('Proofread printed materials',           'todo',        'medium', 9),
  ('Send flyers to print vendor',           'todo',        'urgent', 10)
) as v(title, status, priority, due)
where c.slug = 'committee_flyer'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Sponsor Coordination
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Prepare sponsorship deck',              'done',        'high',   -6),
  ('Reach out to gold-tier prospects',      'in_progress', 'urgent', 1),
  ('Collect sponsor logos',                 'todo',        'medium', 8),
  ('Send sponsor invoices',                 'blocked',     'high',   -2),
  ('Arrange sponsor booth spaces',          'todo',        'medium', 12)
) as v(title, status, priority, due)
where c.slug = 'committee_sponsors'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Hotel & Accommodation
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Negotiate group room rates',            'done',        'high',   -4),
  ('Confirm speaker room bookings',         'in_progress', 'high',   3),
  ('Arrange airport shuttle with hotel',    'todo',        'medium', 7),
  ('Share rooming list with front desk',    'todo',        'medium', 10)
) as v(title, status, priority, due)
where c.slug = 'committee_hotel'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Food Committee
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Finalize catering menu',                'in_progress', 'high',   2),
  ('Collect dietary requirements',          'todo',        'high',   5),
  ('Confirm lunch headcount',               'todo',        'medium', 6),
  ('Arrange coffee/tea stations',           'todo',        'low',    9),
  ('Book dessert vendor',                   'todo',        'medium', 11)
) as v(title, status, priority, due)
where c.slug = 'committee_food'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Travel Arrangements
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Book keynote speaker flights',          'in_progress', 'urgent', 1),
  ('Arrange local transport schedule',      'todo',        'high',   6),
  ('Coordinate VIP pickups',                'todo',        'medium', 8),
  ('Share travel itinerary with guests',    'todo',        'medium', 10)
) as v(title, status, priority, due)
where c.slug = 'committee_travel'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Entertainment Group
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Book live band for gala',               'in_progress', 'high',   4),
  ('Plan networking mixer activities',      'todo',        'medium', 7),
  ('Arrange stage and sound equipment',     'todo',        'high',   9),
  ('Prepare emcee run-of-show',             'todo',        'medium', 11)
) as v(title, status, priority, due)
where c.slug = 'committee_entertainment'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

-- Executive Dinner
insert into public.tasks (committee_id, title, status, priority, due_date)
select c.id, v.title, v.status, v.priority, current_date + v.due
from public.committees c
cross join (values
  ('Finalize executive guest list',         'in_progress', 'high',   3),
  ('Reserve private dining room',           'done',        'high',   -2),
  ('Plan seating arrangement',              'todo',        'medium', 8),
  ('Order commemorative gifts',             'todo',        'medium', 10),
  ('Brief service staff on protocol',       'todo',        'low',    12)
) as v(title, status, priority, due)
where c.slug = 'committee_executive'
  and not exists (select 1 from public.tasks t where t.committee_id = c.id);

commit;

-- ============================================================================
-- CLEANUP — remove all seed tasks (run this block on its own to undo).
-- Deletes only unassigned tasks that match the seeded titles above; adjust if
-- you've since edited them. Simplest reset if nothing real has been added yet:
--
--   delete from public.tasks where assignee_id is null and created_by is null;
--
-- ============================================================================
