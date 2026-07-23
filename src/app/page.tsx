import Link from 'next/link';
import { Calendar, Users, Megaphone, ArrowRight, CheckCircle2, LayoutGrid, Table2 } from 'lucide-react';

const FEATURES = [
  {
    icon: Calendar,
    title: 'For Attendees',
    color: 'blue',
    body: 'View the complete event program, session schedules, and venue details — with real-time updates so nothing gets missed.',
    href: '/programs',
    cta: 'View Program',
  },
  {
    icon: Users,
    title: 'For Admins',
    color: 'violet',
    body: 'A single pane of glass across every committee. Track progress live, spot what’s blocked, and coordinate the whole event.',
    href: '/admin',
    cta: 'Admin Dashboard',
  },
  {
    icon: Megaphone,
    title: 'For Committees',
    color: 'emerald',
    body: 'Heads and volunteers manage tasks, shared lists, files, and discussion in one place — no more scattered WhatsApp threads.',
    href: '/committee-portal',
    cta: 'Committee Portal',
  },
];

const HIGHLIGHTS = [
  'Live task boards per committee',
  'Shared, printable lists (speakers, sponsors, guests)',
  'Roles & permissions built in',
  'Files and team chat in context',
];

const colorMap: Record<string, { bg: string; text: string; link: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600', link: 'text-blue-600 hover:text-blue-700' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600', link: 'text-violet-600 hover:text-violet-700' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', link: 'text-emerald-600 hover:text-emerald-700' },
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white">
      {/* Hero */}
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

        {/* Feature cards */}
        <div className="grid md:grid-cols-3 gap-6 mt-20 max-w-5xl mx-auto">
          {FEATURES.map(f => {
            const Icon = f.icon;
            const c = colorMap[f.color];
            return (
              <div key={f.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all p-7">
                <div className={`w-12 h-12 ${c.bg} rounded-xl flex items-center justify-center mb-5`}>
                  <Icon className={`h-6 w-6 ${c.text}`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-5">{f.body}</p>
                <Link href={f.href} className={`${c.link} font-medium text-sm inline-flex items-center`}>
                  {f.cta}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
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
