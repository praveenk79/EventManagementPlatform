'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users2, UserCog, LayoutTemplate } from 'lucide-react';

const TABS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, match: (p: string) => p === '/admin' },
  { href: '/admin-committees', label: 'Committees', icon: Users2, match: (p: string) => p.startsWith('/admin-committees') },
  { href: '/admin-users', label: 'Users', icon: UserCog, match: (p: string) => p.startsWith('/admin-users') },
  { href: '/admin-templates', label: 'Templates', icon: LayoutTemplate, match: (p: string) => p.startsWith('/admin-templates') },
];

export default function AdminNav() {
  const pathname = usePathname() ?? '';

  return (
    <div className="flex items-center gap-1 mb-8 border-b border-gray-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0 ${
              active
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 2} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
