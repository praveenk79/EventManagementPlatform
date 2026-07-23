'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Home, CalendarDays, Users2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import UserMenu from './UserMenu';

const BASE_NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/programs', label: 'Program', icon: CalendarDays, match: (p: string) => p.startsWith('/programs') },
];

const COMMITTEE_NAV_ITEM = { href: '/committee-portal', label: 'Committees', icon: Users2, match: (p: string) => p.startsWith('/committee') };
const ADMIN_NAV_ITEM = { href: '/admin', label: 'Admin', icon: ShieldCheck, match: (p: string) => p.startsWith('/admin') };

export default function Navigation() {
  const pathname = usePathname();
  const { user, isAdmin, committeeRoles, loading } = useAuth();

  const navItems = [
    ...BASE_NAV_ITEMS,
    ...(isAdmin || committeeRoles.length > 0 ? [COMMITTEE_NAV_ITEM] : []),
    ...(isAdmin ? [ADMIN_NAV_ITEM] : []),
  ];

  return (
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

          {/* Navigation Links */}
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
  );
}
