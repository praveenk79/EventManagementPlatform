// Role-Based Access Control System

export type SystemRole = 'super_user' | 'admin' | 'member';
export type CommitteeRole = 'committee_head' | 'committee_member';

export interface User {
  id: string;
  name: string;
  email: string;
  systemRole: SystemRole;
  committees: { committeeId: string; role: CommitteeRole }[];
}

export interface Committee {
  id: string;
  name: string;
  description: string;
  lead: string; // userId
  members: string[]; // userIds
  createdAt: string;
  archived: boolean;
}

export const PERMISSIONS = {
  CREATE_COMMITTEES: ['super_user', 'admin'],
  MANAGE_ALL_COMMITTEES: ['super_user', 'admin'],
  MANAGE_ASSIGNED_COMMITTEES: ['super_user', 'admin', 'committee_head'],
  VIEW_ASSIGNED_COMMITTEES: ['super_user', 'admin', 'committee_head', 'committee_member'],
  ASSIGN_MEMBERS: ['super_user', 'admin', 'committee_head'],
  MANAGE_ROLES: ['super_user', 'admin'],
  VIEW_ALL_USERS: ['super_user', 'admin'],
};

export function hasPermission(
  userRole: SystemRole,
  permission: keyof typeof PERMISSIONS,
  committeeRole?: CommitteeRole
): boolean {
  const allowedRoles = PERMISSIONS[permission];
  if (allowedRoles.includes(userRole)) return true;
  if (committeeRole && allowedRoles.includes(committeeRole)) return true;
  return false;
}

export function getUserCommittees(user: User, allCommittees: Committee[]): Committee[] {
  if (user.systemRole === 'super_user' || user.systemRole === 'admin') {
    return allCommittees.filter(c => !c.archived);
  }
  return allCommittees.filter(
    c =>
      !c.archived &&
      (user.committees.some(uc => uc.committeeId === c.id) || c.lead === user.id)
  );
}

export function getCommitteeRole(user: User, committeeId: string): CommitteeRole | null {
  const committee = user.committees.find(c => c.committeeId === committeeId);
  return committee?.role ?? null;
}

// Default users - all committee leads
export const DEFAULT_USERS: User[] = [
  { id: 'user_admin', name: 'Admin User', email: 'admin@event.com', systemRole: 'admin', committees: [] },
  { id: 'user_john', name: 'John Doe', email: 'john@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_youth', role: 'committee_head' }] },
  { id: 'user_sarah', name: 'Sarah Smith', email: 'sarah@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_awards', role: 'committee_head' }] },
  { id: 'user_mike', name: 'Mike Johnson', email: 'mike@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_speakers', role: 'committee_head' }] },
  { id: 'user_emily', name: 'Emily Davis', email: 'emily@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_registration', role: 'committee_head' }] },
  { id: 'user_alex', name: 'Alex Chen', email: 'alex@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_website', role: 'committee_head' }] },
  { id: 'user_maria', name: 'Maria Garcia', email: 'maria@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_flyer', role: 'committee_head' }] },
  { id: 'user_david', name: 'David Lee', email: 'david@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_sponsors', role: 'committee_head' }] },
  { id: 'user_lisa', name: 'Lisa Wang', email: 'lisa@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_hotel', role: 'committee_head' }] },
  { id: 'user_james', name: 'James Wilson', email: 'james@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_food', role: 'committee_head' }] },
  { id: 'user_anna', name: 'Anna Martinez', email: 'anna@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_travel', role: 'committee_head' }] },
  { id: 'user_chris', name: 'Chris Brown', email: 'chris@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_entertainment', role: 'committee_head' }] },
  { id: 'user_jennifer', name: 'Jennifer Taylor', email: 'jennifer@event.com', systemRole: 'member', committees: [{ committeeId: 'committee_executive', role: 'committee_head' }] },
];

// Default committees - all 12 committees with descriptions
export const DEFAULT_COMMITTEES: Committee[] = [
  { id: 'committee_youth', name: 'Youth Conference', description: 'Youth track coordination', lead: 'user_john', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_awards', name: 'Award Committee', description: 'Award selection and recognition', lead: 'user_sarah', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_speakers', name: 'Speaker Coordination', description: 'Speaker recruitment and scheduling', lead: 'user_mike', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_registration', name: 'Registration Committee', description: 'Registration and check-in', lead: 'user_emily', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_website', name: 'Website Communications', description: 'Website content and updates', lead: 'user_alex', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_flyer', name: 'Flyer Design', description: 'Marketing flyers and materials', lead: 'user_maria', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_sponsors', name: 'Sponsor Coordination', description: 'Sponsorship management', lead: 'user_david', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_hotel', name: 'Hotel & Accommodation', description: 'Hotel booking and coordination', lead: 'user_lisa', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_food', name: 'Food Committee', description: 'Catering and dining arrangements', lead: 'user_james', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_travel', name: 'Travel Arrangements', description: 'Transportation and travel logistics', lead: 'user_anna', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_entertainment', name: 'Entertainment Group', description: 'Entertainment and activities', lead: 'user_chris', members: [], createdAt: '2026-01-01', archived: false },
  { id: 'committee_executive', name: 'Executive Dinner', description: 'Executive event planning', lead: 'user_jennifer', members: [], createdAt: '2026-01-01', archived: false },
];
