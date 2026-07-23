'use client';

import Link from 'next/link';
import { Calendar, Users, Megaphone, ArrowRight, CheckCircle2, LayoutGrid, Table2, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

// --- Logged-out marketing content ---
const FEATURES = [
  {
    icon: Calendar,
    title: 'For Attendees',
    color: 'blue',
    body: 'View the complete event program, session schedules, and venue details — with real-time updates so nothing gets missed.',
  },
  {
    icon: Users,
    title: 'For Admins',
    color: 'violet',
    body: 'A single pane of glass across every committee. Track progress live, spot what’s blocked, and coordinate the whole event.',
  },
  {
    icon: Megaphone,
    title: 'For Committees',
    color: 'emerald',
    body: 'Heads and volunteers manage tasks, shared lists, files, and discussion in one place — no more scattered WhatsApp threads.',
  },
];

const HIGHLIGHTS = [
  'Live task boards per committee',
  'Shared, printable lists (speakers, sponsors, guests)',
  'Roles & permissions built in',
  'Files and team chat in context',
];

const colorMap: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
};

export default function HomePage() {
  const { user, profile, isAdmin, committeeRoles, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // ============================ SIGNED IN ============================
  // Personalized landing: only the destinations this person can actually use.
  if (user) {
    const firstName = (profile?.full_name || user.email || 'there').split(' ')[0].split('@')[0];

    const tiles = [
      {
        show: true,
        href: '/programs',
        icon: Calendar,
        color: 'blue',
        title: 'Event Program',
        body: 'Browse the full schedule of sessions and activities.',
      },
      {
        show: committeeRoles.length > 0 || isAdmin,
        href: '/committee-portal',
        icon: Users,
        color: 'emerald',
        title: 'My Committees',
        body: isAdmin ? 'Jump into any committee’s tasks, lists, and files.' : 'Your committees — tasks, lists, files, and chat.',
      },
      {
        show: isAdmin,
        href: '/admin',
        icon: ShieldCheck,
        color: 'violet',
        title: 'Admin Dashboard',
        body: 'Oversee every committee, manage users, and track progress.',
      },
    ].filter(t => t.show);

    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white">
        <div className="container mx-auto px-4 pt-16 pb-16 max-w-5xl">
          <div className="mb-10">
            <p className="text-indigo-600 font-medium mb-1">Welcome back,</p>
            <h1 className="text-4xl font-bold text-gray-900">{firstName} 👋</h1>
            <p className="text-gray-600 mt-2">Here’s what you have access to.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {tiles.map(t => {
              const Icon = t.icon;
              const c = colorMap[t.color];
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all p-7"
                >
                  <div className={`w-12 h-12 ${c.bg} rounded-xl flex items-center justify-center mb-5`}>
                    <Icon className={`h-6 w-6 ${c.text}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1.5 flex items-center gap-1">
                    {t.title}
                    <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{t.body}</p>
                </Link>
              );
            })}
          </div>

          {/* Gentle nudge for plain members with no committee yet */}
          {!isAdmin && committeeRoles.length === 0 && (
            <div className="mt-8 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm text-sm text-gray-600">
              You’re not part of any committee yet. An admin can add you to one — once they do, it’ll show up here.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================ SIGNED OUT ============================
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white">
      <div className="container mx-auto px-4 pt-20 pb-16">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium mb-6">
            <LayoutGrid className="h-4 w-4" />
            One platform for your entire event
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 tracking-tight leading-[1.05]">
            Run your event without the{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">chaos</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mb-9 max-w-2xl mx-auto">
            Bring every committee, task, and list into one shared workspace — so everyone sees the same live picture, and nobody has to chase updates.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold rounded-xl text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-md shadow-indigo-200 transition-all"
            >
              Get Started
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              href="/programs"
              className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold rounded-xl text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm transition-colors"
            >
              View Program
            </Link>
          </div>

          {/* Quick highlights */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-10">
            {HIGHLIGHTS.map(h => (
              <div key={h} className="inline-flex items-center gap-2 text-sm text-gray-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* Feature cards — marketing only, shown to logged-out visitors */}
        <div className="grid md:grid-cols-3 gap-6 mt-20 max-w-5xl mx-auto">
          {FEATURES.map(f => {
            const Icon = f.icon;
            const c = colorMap[f.color];
            return (
              <div key={f.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7">
                <div className={`w-12 h-12 ${c.bg} rounded-xl flex items-center justify-center mb-5`}>
                  <Icon className={`h-6 w-6 ${c.text}`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.body}</p>
              </div>
            );
          })}
        </div>

        {/* Closing band */}
        <div className="mt-20 max-w-5xl mx-auto rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-10 md:p-14 text-center text-white shadow-xl shadow-indigo-200/50">
          <Table2 className="h-10 w-10 mx-auto mb-4 opacity-90" />
          <h2 className="text-2xl md:text-3xl font-bold mb-3">Everything your committees need, in one place</h2>
          <p className="text-indigo-100 max-w-2xl mx-auto mb-8">
            Replace the spreadsheets in Drive and the endless WhatsApp threads. Assign work, track lists, and keep everyone aligned — live.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold rounded-xl text-indigo-700 bg-white hover:bg-indigo-50 shadow-md transition-colors"
          >
            Sign In to Get Started
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
