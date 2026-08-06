// Vendor directory — pure helpers, no React.
// See supabase/vendors.sql for the schema these mirror. Vendors are
// event-wide (not committee-owned) — see that file's header for why.

export type VendorStatus = 'potential' | 'active' | 'past' | 'rejected';

export interface Vendor {
  id: string;
  name: string;
  category: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string;
  status: VendorStatus;
  owningCommitteeId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// `tone` mirrors the Tailwind class convention already used for task
// status/priority pills in committee/[id]/page.tsx (statusStyle/priorityStyle).
export const VENDOR_STATUSES: { value: VendorStatus; label: string; tone: string }[] = [
  { value: 'potential', label: 'Potential', tone: 'bg-gray-100 text-gray-800' },
  { value: 'active', label: 'Active', tone: 'bg-green-100 text-green-800' },
  { value: 'past', label: 'Past', tone: 'bg-blue-100 text-blue-800' },
  { value: 'rejected', label: 'Rejected', tone: 'bg-red-100 text-red-800' },
];

// Common categories offered as suggestions — category itself is free text in
// the DB (a check constraint would reject "Ice sculptor", which is a real
// vendor someone will eventually type in).
export const CATEGORY_SUGGESTIONS: string[] = [
  'Catering',
  'Printing',
  'AV',
  'Venue',
  'Accommodation',
  'Transport',
  'Photography',
  'Florist',
  'Security',
  'Entertainment',
  'Other',
];

export function mapVendorRow(row: Record<string, unknown>): Vendor {
  return {
    id: row.id as string,
    name: row.name as string,
    category: (row.category as string | null) ?? null,
    contactName: (row.contact_name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    notes: (row.notes as string | null) ?? '',
    status: (row.status as VendorStatus) ?? 'potential',
    owningCommitteeId: (row.owning_committee_id as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Prepends https:// when the user typed a bare domain (acme.com -> https://acme.com).
// Needed because <a href="acme.com"> resolves as a relative path inside the
// app and 404s, instead of opening the external site.
export function normalizeWebsite(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
