// Built-in starter templates for the Lists feature. These are defined in code
// (not the database) so they're always available and can't be broken at
// runtime — see supabase/lists.sql. Picking a template pre-fills a new list's
// columns; users can add/remove columns per list afterward.

export type ColumnType = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'person' | 'link';

export interface TemplateColumn {
  label: string;
  type: ColumnType;
  options?: string[]; // only used by 'select'
}

export interface ListTemplate {
  key: string;
  name: string;
  description: string;
  category: string;
  columns: TemplateColumn[];
}

export const LIST_TEMPLATES: ListTemplate[] = [
  {
    key: 'blank',
    name: 'Blank list',
    description: 'Start empty and define your own columns.',
    category: 'General',
    columns: [{ label: 'Name', type: 'text' }],
  },

  // --- People ---------------------------------------------------------------
  {
    key: 'speakers',
    name: 'Speakers',
    description: 'Track invited speakers, their talks, and confirmation status.',
    category: 'People',
    columns: [
      { label: 'Name', type: 'text' },
      { label: 'Topic / Talk', type: 'text' },
      { label: 'Email', type: 'text' },
      { label: 'Phone', type: 'text' },
      { label: 'Bio', type: 'text' },
      { label: 'Headshot', type: 'link' },
      { label: 'Status', type: 'select', options: ['Invited', 'Confirmed', 'Declined'] },
    ],
  },
  {
    key: 'panelists',
    name: 'Panelists',
    description: 'People sitting on a panel or session.',
    category: 'People',
    columns: [
      { label: 'Name', type: 'text' },
      { label: 'Panel / Session', type: 'text' },
      { label: 'Email', type: 'text' },
      { label: 'Organization', type: 'text' },
      { label: 'Confirmed?', type: 'checkbox' },
    ],
  },
  {
    key: 'guest_vip',
    name: 'Guest / VIP List',
    description: 'Invitees, RSVPs, and seat counts.',
    category: 'People',
    columns: [
      { label: 'Name', type: 'text' },
      { label: 'Organization', type: 'text' },
      { label: 'Invited by', type: 'text' },
      { label: 'RSVP', type: 'select', options: ['Yes', 'No', 'Maybe'] },
      { label: 'Seats', type: 'number' },
    ],
  },
  {
    key: 'volunteers',
    name: 'Volunteer Roster',
    description: 'Volunteers, their shifts, and contact details.',
    category: 'People',
    columns: [
      { label: 'Name', type: 'text' },
      { label: 'Role', type: 'text' },
      { label: 'Phone', type: 'text' },
      { label: 'Shift', type: 'select', options: ['Morning', 'Afternoon', 'Evening', 'Full day'] },
      { label: 'Confirmed?', type: 'checkbox' },
    ],
  },
  {
    key: 'attendees',
    name: 'Attendee / Registration',
    description: 'Registered attendees and check-in tracking.',
    category: 'People',
    columns: [
      { label: 'Name', type: 'text' },
      { label: 'Email', type: 'text' },
      { label: 'Ticket type', type: 'select', options: ['General', 'VIP', 'Student', 'Speaker'] },
      { label: 'Paid?', type: 'checkbox' },
      { label: 'Checked in?', type: 'checkbox' },
    ],
  },

  // --- Money ----------------------------------------------------------------
  {
    key: 'sponsors',
    name: 'Sponsors',
    description: 'Sponsorship pipeline, tiers, and payment status.',
    category: 'Money',
    columns: [
      { label: 'Company', type: 'text' },
      { label: 'Contact name', type: 'text' },
      { label: 'Email', type: 'text' },
      { label: 'Tier', type: 'select', options: ['Gold', 'Silver', 'Bronze'] },
      { label: 'Amount', type: 'number' },
      { label: 'Paid?', type: 'checkbox' },
    ],
  },
  {
    key: 'budget',
    name: 'Budget / Expenses',
    description: 'Track planned and actual spend by line item.',
    category: 'Money',
    columns: [
      { label: 'Item', type: 'text' },
      { label: 'Category', type: 'text' },
      { label: 'Estimated', type: 'number' },
      { label: 'Actual', type: 'number' },
      { label: 'Status', type: 'select', options: ['Planned', 'Approved', 'Paid'] },
    ],
  },

  // --- Logistics ------------------------------------------------------------
  {
    key: 'vendors',
    name: 'Vendors',
    description: 'Suppliers, services, and booking status.',
    category: 'Logistics',
    columns: [
      { label: 'Vendor', type: 'text' },
      { label: 'Service', type: 'text' },
      { label: 'Contact', type: 'text' },
      { label: 'Phone', type: 'text' },
      { label: 'Cost', type: 'number' },
      { label: 'Booked?', type: 'checkbox' },
    ],
  },
  {
    key: 'travel',
    name: 'Travel & Accommodation',
    description: 'Arrivals, departures, and hotel bookings.',
    category: 'Logistics',
    columns: [
      { label: 'Guest name', type: 'text' },
      { label: 'Arrival date', type: 'date' },
      { label: 'Departure date', type: 'date' },
      { label: 'Flight / Train', type: 'text' },
      { label: 'Hotel', type: 'text' },
      { label: 'Room booked?', type: 'checkbox' },
    ],
  },
  {
    key: 'catering',
    name: 'Catering / Menu',
    description: 'Meals, dietary needs, and headcounts.',
    category: 'Logistics',
    columns: [
      { label: 'Meal', type: 'select', options: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] },
      { label: 'Menu item', type: 'text' },
      { label: 'Dietary', type: 'select', options: ['Regular', 'Vegetarian', 'Vegan', 'Gluten-free'] },
      { label: 'Headcount', type: 'number' },
      { label: 'Confirmed?', type: 'checkbox' },
    ],
  },
  {
    key: 'equipment',
    name: 'Equipment / Inventory',
    description: 'Gear needed on site and who owns it.',
    category: 'Logistics',
    columns: [
      { label: 'Item', type: 'text' },
      { label: 'Quantity', type: 'number' },
      { label: 'Owner / Source', type: 'text' },
      { label: 'Location', type: 'text' },
      { label: 'Ready?', type: 'checkbox' },
    ],
  },

  // --- Program & Marketing --------------------------------------------------
  {
    key: 'awards',
    name: 'Awards / Nominees',
    description: 'Award categories, nominees, and winners.',
    category: 'Program',
    columns: [
      { label: 'Nominee', type: 'text' },
      { label: 'Category', type: 'text' },
      { label: 'Nominated by', type: 'text' },
      { label: 'Notes', type: 'text' },
      { label: 'Winner?', type: 'checkbox' },
    ],
  },
  {
    key: 'agenda',
    name: 'Agenda / Sessions',
    description: 'Session plan with times and rooms.',
    category: 'Program',
    columns: [
      { label: 'Session', type: 'text' },
      { label: 'Speaker', type: 'text' },
      { label: 'Date', type: 'date' },
      { label: 'Time', type: 'text' },
      { label: 'Room', type: 'text' },
      { label: 'Type', type: 'select', options: ['Keynote', 'Panel', 'Workshop', 'Break'] },
    ],
  },
  {
    key: 'social_posts',
    name: 'Social / Marketing',
    description: 'Content calendar for promoting the event.',
    category: 'Program',
    columns: [
      { label: 'Post', type: 'text' },
      { label: 'Channel', type: 'select', options: ['Instagram', 'LinkedIn', 'Twitter/X', 'Email'] },
      { label: 'Publish date', type: 'date' },
      { label: 'Owner', type: 'text' },
      { label: 'Status', type: 'select', options: ['Idea', 'Drafted', 'Scheduled', 'Posted'] },
    ],
  },
];

// The column types a list can use, with display labels — shared by the admin
// gallery legend and (indirectly) the list column manager.
export const COLUMN_TYPE_META: { type: ColumnType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'select', label: 'Dropdown' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'person', label: 'Person' },
  { type: 'link', label: 'Link / URL' },
];

export function getTemplate(key: string): ListTemplate | undefined {
  return LIST_TEMPLATES.find(t => t.key === key);
}

// Templates grouped by category, for the admin gallery. 'General' (Blank) first.
export function templatesByCategory(): { category: string; templates: ListTemplate[] }[] {
  const order = ['General', 'People', 'Money', 'Logistics', 'Program'];
  const groups = new Map<string, ListTemplate[]>();
  for (const t of LIST_TEMPLATES) {
    if (!groups.has(t.category)) groups.set(t.category, []);
    groups.get(t.category)!.push(t);
  }
  return [...groups.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([category, templates]) => ({ category, templates }));
}
