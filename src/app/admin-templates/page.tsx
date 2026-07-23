'use client';

import { LayoutTemplate, Loader2 } from 'lucide-react';
import AdminNav from '@/components/AdminNav';
import { templatesByCategory, COLUMN_TYPE_META } from '@/lib/list-templates';
import { useRequireAdmin } from '@/lib/use-require-admin';

const typeChipClass: Record<string, string> = {
  text: 'bg-gray-100 text-gray-700',
  number: 'bg-blue-100 text-blue-700',
  date: 'bg-purple-100 text-purple-700',
  select: 'bg-amber-100 text-amber-700',
  checkbox: 'bg-emerald-100 text-emerald-700',
  person: 'bg-indigo-100 text-indigo-700',
  link: 'bg-sky-100 text-sky-700',
};

export default function AdminTemplates() {
  const { allowed, checking } = useRequireAdmin();
  const groups = templatesByCategory();

  if (checking || !allowed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <AdminNav />

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
            <LayoutTemplate className="h-9 w-9 text-indigo-600" /> List Templates
          </h1>
          <p className="text-gray-600 mt-2">
            Ready-made starting points for committee lists. When a head creates a list, they can pick any of these and the columns are filled in automatically.
          </p>
        </div>

        {groups.map(group => (
          <div key={group.category} className="mb-10">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{group.category}</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.templates.map(t => (
                <div key={t.key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <h3 className="font-semibold text-gray-900">{t.name}</h3>
                  <p className="text-sm text-gray-500 mt-1 mb-4 min-h-[2.5rem]">{t.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.columns.map(c => (
                      <span key={c.label} className={`text-xs px-2 py-1 rounded-md font-medium ${typeChipClass[c.type] ?? 'bg-gray-100 text-gray-700'}`}>
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Column types</h2>
          <div className="flex flex-wrap gap-2">
            {COLUMN_TYPE_META.map(m => (
              <span key={m.type} className={`text-xs px-2 py-1 rounded-md font-medium ${typeChipClass[m.type]}`}>
                {m.label}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Templates are managed by the development team. Tell us what lists your committees need and we&apos;ll add them here.
          </p>
        </div>
      </div>
    </div>
  );
}
