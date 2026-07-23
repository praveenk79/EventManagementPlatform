// Role-based access control — domain types and pure permission logic.
// Operates on real rows from Supabase (profiles/committees/committee_members),
// not static demo data. See src/lib/auth-context.tsx for the React state that
// supplies these values at runtime.

export type SystemRole = 'member' | 'admin' | 'super_admin';
export type CommitteeRole = 'volunteer' | 'head';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  system_role: SystemRole;
}

export interface CommitteeMembership {
  committee_id: string;
  role: CommitteeRole;
}

export interface Committee {
  id: string;
  slug: string;
  name: string;
  description: string;
  archived: boolean;
  created_by: string | null;
  created_at: string;
}

export const PERMISSIONS = {
  MANAGE_COMMITTEES: ['admin', 'super_admin'],
  MANAGE_USERS: ['admin', 'super_admin'],
  VIEW_ADMIN_DASHBOARD: ['admin', 'super_admin'],
  MANAGE_PROGRAM: ['admin', 'super_admin'],
} as const satisfies Record<string, readonly SystemRole[]>;

export function isAdminRole(role: SystemRole): boolean {
  return role === 'admin' || role === 'super_admin';
}

export function hasPermission(systemRole: SystemRole, permission: keyof typeof PERMISSIONS): boolean {
  return (PERMISSIONS[permission] as readonly SystemRole[]).includes(systemRole);
}

// Committees a user can see: admins see everything active, everyone else
// only sees committees they're a member of (mirrors the committees SELECT
// RLS policy in supabase/schema.sql).
export function getUserCommittees(
  committees: Committee[],
  committeeRoles: CommitteeMembership[],
  isAdmin: boolean
): Committee[] {
  if (isAdmin) return committees.filter(c => !c.archived);
  const memberIds = new Set(committeeRoles.map(c => c.committee_id));
  return committees.filter(c => !c.archived && memberIds.has(c.id));
}

export function getCommitteeRole(committeeRoles: CommitteeMembership[], committeeId: string): CommitteeRole | null {
  return committeeRoles.find(c => c.committee_id === committeeId)?.role ?? null;
}

export function isCommitteeHead(committeeRoles: CommitteeMembership[], committeeId: string, isAdmin: boolean): boolean {
  return isAdmin || committeeRoles.some(c => c.committee_id === committeeId && c.role === 'head');
}

export function isCommitteeMember(committeeRoles: CommitteeMembership[], committeeId: string, isAdmin: boolean): boolean {
  return isAdmin || committeeRoles.some(c => c.committee_id === committeeId);
}
