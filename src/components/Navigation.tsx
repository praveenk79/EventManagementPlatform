'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LayoutGrid, Home, CalendarDays, Users2, ShieldCheck, FolderOpen, Store, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useEvent } from '@/lib/event-context';
import UserMenu from './UserMenu';

const BASE_NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/programs', label: 'Program', icon: CalendarDays, match: (p: string) => p.startsWith('/programs') },
];

const COMMITTEE_NAV_ITEM = { href: '/committee-portal', label: 'Committees', icon: Users2, match: (p: string) => p.startsWith('/committee') };
const DOCUMENTS_NAV_ITEM = { href: '/documents', label: 'Documents', icon: FolderOpen, match: (p: string) => p.startsWith('/documents') };
const VENDORS_NAV_ITEM = { href: '/vendors', label: 'Vendors', icon: Store, match: (p: string) => p.startsWith('/vendors') };
const ADMIN_NAV_ITEM = { href: '/admin', label: 'Admin', icon: ShieldCheck, match: (p: string) => p.startsWith('/admin') };

function EventSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const { events, currentEvent, setCurrentEventId, loading: eventsLoading } = useEvent();

  if (eventsLoading) {
    return <div className="hidden md:block w-32 h-9 rounded-lg bg-gray-100 animate-pulse" />;
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="relative hidden md:block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors max-w-[200px]"
      >
        <span className="truncate">{currentEvent?.name ?? 'Select event'}</span>
        <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute left-0 mt-2 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-20 py-1">
            {events.map(event => {
              const selected = event.id === currentEvent?.id;
              return (
                <button
                  key={event.id}
                  onClick={() => {
                    setCurrentEventId(event.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                    selected ? 'text-indigo-700 font-semibold' : 'text-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Check className={`h-4 w-4 shrink-0 ${selected ? 'text-indigo-600' : 'text-transparent'}`} />
                    <span className="truncate">{event.name}</span>
                  </span>
                  {event.status === 'archived' && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-medium shrink-0">
                      Archived
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const { user, isAdmin, committeeRoles, loading } = useAuth();

  const navItems = [
    ...BASE_NAV_ITEMS,
    ...(isAdmin || committeeRoles.length > 0 ? [COMMITTEE_NAV_ITEM] : []),
    ...(isAdmin || committeeRoles.length > 0 ? [DOCUMENTS_NAV_ITEM] : []),
    ...(isAdmin || committeeRoles.length > 0 ? [VENDORS_NAV_ITEM] : []),
    ...(isAdmin ? [ADMIN_NAV_ITEM] : []),
  ];

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-[68px] gap-6">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-sm">
                <LayoutGrid className="h-5 w-5 text-white" strokeWidth={2.25} />
              </div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="font-bold text-[17px] text-gray-900 tracking-tight">EventManagement</span>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Platform</span>
              </div>
            </Link>

            {/* Event switcher — admins only, hidden below md (mobile has no room up top).
                EventSwitcher itself handles the loading skeleton and the
                "no events" (render nothing) cases. */}
            {isAdmin && <EventSwitcher />}

            {/* Navigation Links — desktop only (mobile uses the bottom tab bar) */}
            <div className="hidden md:flex items-center justify-end gap-1 flex-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const active = item.match(pathname ?? '');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 text-sm px-3.5 py-2 rounded-lg transition-colors ${
                      active
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 2} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Auth Button / User Menu */}
            <div className="flex items-center gap-3 shrink-0">
              {loading ? (
                <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
              ) : user ? (
                <UserMenu />
              ) : (
                <Link
                  href="/auth/login"
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Bottom tab bar — mobile only. Fixed to the bottom like a native app,
          honours the iOS home-bar safe area. Hidden from md up.
          Up to 6 items now fit (Home, Program, Committees, Documents, Vendors,
          Admin). Rather than dropping/hiding any of them at 320px, each tab
          shrinks (min-w-0 + truncate on the label) so the row divides evenly
          without wrapping or overflowing, and the row itself scrolls
          horizontally as a fallback if a future addition still doesn't fit. */}
      {user && navItems.length > 0 && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-stretch overflow-x-auto">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = item.match(pathname ?? '');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 min-h-[56px] px-0.5 pt-2 pb-1.5 text-[10px] font-medium transition-colors ${
                    active ? 'text-indigo-700' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
                  <span className="leading-none truncate max-w-full">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
