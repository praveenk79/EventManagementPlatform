'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Unlock, Award, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { getUserCommittees, getCommitteeRole, type Committee } from '@/lib/rbac';

export default function CommitteePortal() {
  const { user, profile, committeeRoles, isAdmin, loading: authLoading } = useAuth();
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;

    const load = async () => {
      setIsLoading(true);
      const supabase = createClient();
      const { data: committeeRows } = await supabase.from('committees').select('*').eq('archived', false);
      const all = committeeRows ?? [];
      setCommittees(all);

      if (all.length > 0) {
        const { data: memberRows } = await supabase
          .from('committee_members')
          .select('committee_id')
          .in('committee_id', all.map(c => c.id));
        const counts: Record<string, number> = {};
        for (const row of memberRows ?? []) {
          counts[row.committee_id] = (counts[row.committee_id] ?? 0) + 1;
        }
        setMemberCounts(counts);
      }
      setIsLoading(false);
    };
    load();
  }, [authLoading, user]);

  const userCommittees = getUserCommittees(committees, committeeRoles, isAdmin);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Committee Portal</h1>
              {profile && (
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-gray-600">
                    Signed in as: <span className="font-semibold">{profile.full_name || profile.email}</span>
                  </p>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      profile.system_role === 'super_admin'
                        ? 'bg-red-100 text-red-800'
                        : profile.system_role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {profile.system_role === 'super_admin'
                      ? 'Super Admin'
                      : profile.system_role.charAt(0).toUpperCase() + profile.system_role.slice(1)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Committees */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Committees ({userCommittees.length})</h2>

          {userCommittees.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Committees Yet</h3>
              <p className="text-gray-600">
                You don&apos;t have access to any committees yet. Ask an admin to add you to one.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {userCommittees.map(committee => {
                const committeeRole = getCommitteeRole(committeeRoles, committee.id);
                const canManage = isAdmin || committeeRole === 'head';

                return (
                  <div
                    key={committee.id}
                    className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow p-6 border-l-4 border-indigo-600"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-900">{committee.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{committee.description}</p>
                      </div>
                      {canManage && <Unlock className="h-5 w-5 text-green-600 flex-shrink-0" />}
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Award className="h-4 w-4" />
                        <span>
                          Your Role:{' '}
                          <span
                            className={`font-semibold px-2 py-1 rounded text-xs ${
                              committeeRole === 'head' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {isAdmin && !committeeRole ? 'Admin (all access)' : committeeRole === 'head' ? 'Committee Head' : 'Volunteer'}
                          </span>
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <span>
                          {memberCounts[committee.id] ?? 0} member{(memberCounts[committee.id] ?? 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    <Link
                      href={`/committee/${committee.id}`}
                      className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      View Tasks
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
