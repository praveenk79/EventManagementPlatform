'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Store,
  Plus,
  Search,
  Pencil,
  Check,
  X,
  Trash2,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Mail,
  Phone,
  ExternalLink,
  FileText,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Committee } from '@/lib/rbac';
import { DOC_TYPES, type DocType } from '@/lib/folders';
import {
  VENDOR_STATUSES,
  CATEGORY_SUGGESTIONS,
  mapVendorRow,
  normalizeWebsite,
  type Vendor,
  type VendorStatus,
} from '@/lib/vendors';

type VendorDoc = {
  id: string;
  fileName: string;
  docType: DocType | null;
  committeeName: string;
  storagePath: string;
};

const statusToneOf = (status: VendorStatus) => VENDOR_STATUSES.find(s => s.value === status)?.tone ?? 'bg-gray-100 text-gray-800';
const statusLabelOf = (status: VendorStatus) => VENDOR_STATUSES.find(s => s.value === status)?.label ?? status;
const docTypeLabel = (docType: DocType | null) => DOC_TYPES.find(d => d.value === docType)?.label ?? null;

// Empty draft used both for a brand-new vendor and as the shape held while a
// row is being edited (nothing writes to Supabase until Save).
type VendorDraft = {
  name: string;
  category: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  notes: string;
  status: VendorStatus;
  owningCommitteeId: string;
};

const emptyDraft: VendorDraft = {
  name: '',
  category: '',
  contactName: '',
  email: '',
  phone: '',
  website: '',
  notes: '',
  status: 'potential',
  owningCommitteeId: '',
};

export default function VendorsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, isAdmin, committeeRoles, loading: authLoading } = useAuth();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [docsByVendor, setDocsByVendor] = useState<Record<string, VendorDoc[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | VendorStatus>('all');

  const [showAdd, setShowAdd] = useState(false);
  const [addDraft, setAddDraft] = useState<VendorDraft>(emptyDraft);
  const [isAdding, setIsAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<VendorDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Heads are the ones actually talking to suppliers — admins too. Not
  // restricted to the owning committee: a wrong phone number should be
  // fixable by whoever notices it. Mirrors the vendors.sql RLS policies.
  const canManage = isAdmin || committeeRoles.some(r => r.role === 'head');

  const load = useCallback(async () => {
    setIsLoading(true);
    const [{ data: vendorRows }, { data: committeeRows }, { data: docRows }] = await Promise.all([
      supabase.from('vendors').select('*').order('name'),
      supabase.from('committees').select('*').eq('archived', false).order('name'),
      supabase
        .from('committee_files')
        .select('id, file_name, doc_type, storage_path, vendor_id, committee_id')
        .not('vendor_id', 'is', null),
    ]);

    setVendors((vendorRows ?? []).map(mapVendorRow));
    setCommittees(committeeRows ?? []);

    const committeeNameById = new Map((committeeRows ?? []).map(c => [c.id, c.name]));
    // A document's committee might be one the viewer isn't otherwise loading
    // (archived, or simply not in the active list above) — fall back to a
    // second lookup for any ids missing from the map, same pattern as
    // /documents' shared-folder lookup.
    const missingIds = Array.from(new Set((docRows ?? []).map(d => d.committee_id))).filter(id => !committeeNameById.has(id));
    if (missingIds.length > 0) {
      const { data: extra } = await supabase.from('committees').select('id, name').in('id', missingIds);
      for (const c of extra ?? []) committeeNameById.set(c.id, c.name);
    }

    const grouped: Record<string, VendorDoc[]> = {};
    for (const d of docRows ?? []) {
      if (!d.vendor_id) continue;
      const doc: VendorDoc = {
        id: d.id,
        fileName: d.file_name,
        docType: (d.doc_type as DocType | null) ?? null,
        committeeName: committeeNameById.get(d.committee_id) ?? 'Unknown committee',
        storagePath: d.storage_path,
      };
      (grouped[d.vendor_id] ??= []).push(doc);
    }
    setDocsByVendor(grouped);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (authLoading || !user) return;
    load();
  }, [authLoading, user, load]);

  // Realtime: a vendor someone else adds/edits/deletes shows up without a
  // refresh. Full reload rather than an incremental patch — the list is small
  // and this keeps document counts/links consistent too.
  useEffect(() => {
    if (!user) return;
    const silentReload = () => load();
    const channel = supabase
      .channel('vendors-directory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendors' }, silentReload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, load]);

  const draftFromVendor = (v: Vendor): VendorDraft => ({
    name: v.name,
    category: v.category ?? '',
    contactName: v.contactName ?? '',
    email: v.email ?? '',
    phone: v.phone ?? '',
    website: v.website ?? '',
    notes: v.notes,
    status: v.status,
    owningCommitteeId: v.owningCommitteeId ?? '',
  });

  const startEdit = (v: Vendor) => {
    setEditingId(v.id);
    setEditDraft(draftFromVendor(v));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(emptyDraft);
  };

  // Shared insert/update payload shape — the DB owns updated_at via trigger,
  // so it is never set from here.
  const draftToPayload = (d: VendorDraft) => ({
    name: d.name.trim(),
    category: d.category.trim() || null,
    contact_name: d.contactName.trim() || null,
    email: d.email.trim() || null,
    phone: d.phone.trim() || null,
    website: d.website.trim() || null,
    notes: d.notes,
    status: d.status,
    owning_committee_id: d.owningCommitteeId || null,
  });

  // Duplicate-name handling: the unique index on lower(trim(name)) means a
  // repeat name fails as a Postgres unique violation (code 23505). Never show
  // that raw error — translate it into plain language.
  const friendlyError = (error: { code?: string } | null, name: string) => {
    if (error?.code === '23505') return `A vendor called "${name}" already exists.`;
    return null;
  };

  const addVendor = async () => {
    if (!addDraft.name.trim() || !profile) return;
    setIsAdding(true);
    const { data, error } = await supabase
      .from('vendors')
      .insert({ ...draftToPayload(addDraft), created_by: profile.id })
      .select('*')
      .single();
    setIsAdding(false);

    if (error || !data) {
      toast.error(friendlyError(error, addDraft.name.trim()) ?? 'Could not add that vendor.');
      return;
    }
    setVendors(prev => [...prev, mapVendorRow(data)].sort((a, b) => a.name.localeCompare(b.name)));
    setAddDraft(emptyDraft);
    setShowAdd(false);
    toast.success('Vendor added');
  };

  const saveEdit = async (vendor: Vendor) => {
    if (!editDraft.name.trim()) return;
    setIsSaving(true);
    const { error } = await supabase.from('vendors').update(draftToPayload(editDraft)).eq('id', vendor.id);
    setIsSaving(false);

    if (error) {
      toast.error(friendlyError(error, editDraft.name.trim()) ?? 'Could not save that change.');
      return;
    }
    setVendors(prev =>
      prev
        .map(v =>
          v.id === vendor.id
            ? {
                ...v,
                name: editDraft.name.trim(),
                category: editDraft.category.trim() || null,
                contactName: editDraft.contactName.trim() || null,
                email: editDraft.email.trim() || null,
                phone: editDraft.phone.trim() || null,
                website: editDraft.website.trim() || null,
                notes: editDraft.notes,
                status: editDraft.status,
                owningCommitteeId: editDraft.owningCommitteeId || null,
              }
            : v
        )
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    toast.success('Saved');
    cancelEdit();
  };

  const deleteVendor = async (vendor: Vendor) => {
    setIsDeleting(true);
    const { error } = await supabase.from('vendors').delete().eq('id', vendor.id);
    setIsDeleting(false);
    setConfirmDeleteId(null);

    if (error) {
      toast.error('Could not delete that vendor.');
      return;
    }
    setVendors(prev => prev.filter(v => v.id !== vendor.id));
    toast.success('Vendor deleted');
  };

  const downloadDoc = async (doc: VendorDoc) => {
    const { data } = await supabase.storage.from('committee-files').createSignedUrl(doc.storagePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const visibleVendors = vendors
    .filter(v => statusFilter === 'all' || v.status === statusFilter)
    .filter(v => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        (v.category ?? '').toLowerCase().includes(q) ||
        (v.contactName ?? '').toLowerCase().includes(q)
      );
    });

  const isFiltering = search.trim() !== '' || statusFilter !== 'all';

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // One vendor row, responsive: 12-col grid on desktop, stacked card on
  // mobile. Read-only by default; the pencil opens per-row Save/Cancel edit
  // mode covering every field including status and owning committee.
  const renderVendorRow = (vendor: Vendor) => {
    const isEditing = editingId === vendor.id;
    const isExpanded = expandedId === vendor.id;
    const docs = docsByVendor[vendor.id] ?? [];

    if (isEditing) {
      return (
        <div key={vendor.id} className="flex flex-col gap-2 md:grid md:grid-cols-12 md:gap-2 px-4 py-3 bg-indigo-50/60 md:items-center">
          <div className="md:col-span-3">
            <input
              type="text"
              value={editDraft.name}
              onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="Vendor name"
              className="w-full px-2 py-1 border border-indigo-300 rounded text-sm font-medium focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="md:col-span-2">
            <input
              type="text"
              value={editDraft.category}
              onChange={e => setEditDraft(d => ({ ...d, category: e.target.value }))}
              placeholder="Category"
              list="vendor-category-suggestions"
              className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="md:col-span-2">
            <select
              value={editDraft.status}
              onChange={e => setEditDraft(d => ({ ...d, status: e.target.value as VendorStatus }))}
              className={`w-full px-2 py-1 border border-indigo-300 rounded text-xs font-medium ${statusToneOf(editDraft.status)}`}
            >
              {VENDOR_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <input
              type="text"
              value={editDraft.contactName}
              onChange={e => setEditDraft(d => ({ ...d, contactName: e.target.value }))}
              placeholder="Contact name"
              className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="md:col-span-1">
            <input
              type="text"
              value={editDraft.phone}
              onChange={e => setEditDraft(d => ({ ...d, phone: e.target.value }))}
              placeholder="Phone"
              className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="md:col-span-1 flex items-center justify-end gap-1">
            <button onClick={() => saveEdit(vendor)} disabled={isSaving || !editDraft.name.trim()} title="Save" className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button onClick={cancelEdit} disabled={isSaving} title="Cancel" className="p-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Second row of edit fields — email/website/owning committee/notes,
              kept out of the 12-col grid above since they don't need a
              read-only column of their own on desktop. */}
          <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
            <input
              type="email"
              value={editDraft.email}
              onChange={e => setEditDraft(d => ({ ...d, email: e.target.value }))}
              placeholder="Email"
              className="px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              value={editDraft.website}
              onChange={e => setEditDraft(d => ({ ...d, website: e.target.value }))}
              placeholder="Website (e.g. acme.com)"
              className="px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
            />
            <select
              value={editDraft.owningCommitteeId}
              onChange={e => setEditDraft(d => ({ ...d, owningCommitteeId: e.target.value }))}
              className="px-2 py-1 border border-indigo-300 rounded text-sm bg-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">No owning committee</option>
              {committees.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-12 mt-1">
            <textarea
              value={editDraft.notes}
              onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))}
              placeholder="Notes"
              rows={2}
              className="w-full px-2 py-1 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      );
    }

    return (
      <div key={vendor.id}>
        <div className="flex flex-col gap-2 md:grid md:grid-cols-12 md:gap-2 px-4 py-3 hover:bg-gray-50 md:items-center">
          <button
            onClick={() => setExpandedId(isExpanded ? null : vendor.id)}
            className="md:col-span-3 flex items-center gap-1.5 text-left min-w-0"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
            <span className="text-sm font-medium text-gray-900 truncate">{vendor.name}</span>
          </button>
          <div className="md:col-span-2 flex items-center gap-2">
            <span className="md:hidden text-xs text-gray-400 w-24 shrink-0">Category</span>
            <p className="text-sm text-gray-600 truncate">{vendor.category || '—'}</p>
          </div>
          <div className="md:col-span-2 flex items-center gap-2">
            <span className="md:hidden text-xs text-gray-400 w-24 shrink-0">Status</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${statusToneOf(vendor.status)}`}>{statusLabelOf(vendor.status)}</span>
          </div>
          <div className="md:col-span-2 flex items-center gap-2">
            <span className="md:hidden text-xs text-gray-400 w-24 shrink-0">Contact</span>
            <p className="text-sm text-gray-600 truncate">{vendor.contactName || '—'}</p>
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <span className="md:hidden text-xs text-gray-400 w-24 shrink-0">Reach</span>
            {vendor.phone && (
              <a href={`tel:${vendor.phone}`} title={vendor.phone} className="text-gray-400 hover:text-indigo-600" onClick={e => e.stopPropagation()}>
                <Phone className="h-4 w-4" />
              </a>
            )}
            {vendor.email && (
              <a href={`mailto:${vendor.email}`} title={vendor.email} className="text-gray-400 hover:text-indigo-600" onClick={e => e.stopPropagation()}>
                <Mail className="h-4 w-4" />
              </a>
            )}
            {vendor.website && (
              <a
                href={normalizeWebsite(vendor.website)}
                target="_blank"
                rel="noopener noreferrer"
                title={vendor.website}
                className="text-gray-400 hover:text-indigo-600"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {docs.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-gray-400" title="Linked documents">
                <FileText className="h-3.5 w-3.5" /> {docs.length}
              </span>
            )}
          </div>
          <div className="md:col-span-1 flex items-center justify-end gap-1">
            {canManage && (
              <button onClick={() => startEdit(vendor)} title="Edit" className="p-1.5 hover:bg-indigo-50 rounded text-gray-300 hover:text-indigo-500 transition-colors">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setConfirmDeleteId(vendor.id)} title="Delete" className="p-1.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Admin-only delete confirm — steers toward status change instead. */}
        {confirmDeleteId === vendor.id && (
          <div className="px-4 pb-4 pt-1 bg-red-50 border-t border-red-100">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-semibold mb-1">Delete {vendor.name}?</p>
                <p>
                  This removes the vendor record permanently. Their documents will be kept but unlinked.
                  Consider setting status to Past or Rejected instead to keep the record.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => deleteVendor(vendor)}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-60 flex items-center gap-2"
              >
                {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Yes, delete
              </button>
              <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Expandable row — notes plus linked documents (from FolderBrowser's
            vendor-link dropdown). */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
            <div className="md:pl-2 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{vendor.notes || 'No notes yet.'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Documents</p>
                {docs.length === 0 ? (
                  <p className="text-sm text-gray-400">No documents linked yet. Link one from a committee&apos;s Files panel.</p>
                ) : (
                  <div className="space-y-1.5">
                    {docs.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="text-sm text-gray-900 truncate">{doc.fileName}</span>
                          {docTypeLabel(doc.docType) && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">{docTypeLabel(doc.docType)}</span>
                          )}
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium">{doc.committeeName}</span>
                        </div>
                        <button onClick={() => downloadDoc(doc)} title="Download" className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded transition-colors shrink-0">
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <datalist id="vendor-category-suggestions">
          {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
        </datalist>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Store className="h-7 w-7 text-indigo-600" /> Vendors
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Every supplier the event deals with — caterer, printer, AV, hotel, florist — with contact details and a link to their documents.
          </p>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-lg shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, category, or contact..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | VendorStatus)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-400"
          >
            <option value="all">All statuses</option>
            {VENDOR_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Column header — desktop only */}
          <div className="hidden md:grid bg-slate-800 grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-slate-200 uppercase tracking-wide">
            <div className="col-span-3">Vendor</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Contact</div>
            <div className="col-span-2">Reach</div>
            <div className="col-span-1"></div>
          </div>
          <div className="divide-y divide-gray-100">
            {vendors.length === 0 && !showAdd && (
              <div className="px-4 py-10 text-center text-sm text-gray-400">
                No vendors yet. {canManage && <>Click <span className="font-medium text-indigo-600">+ Add Vendor</span> to get started.</>}
              </div>
            )}
            {vendors.length > 0 && visibleVendors.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-gray-400">
                No vendors match your search. {isFiltering && (
                  <button onClick={() => { setSearch(''); setStatusFilter('all'); }} className="text-indigo-600 hover:text-indigo-700 font-medium">
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {visibleVendors.map(renderVendorRow)}

            {canManage && (showAdd ? (
              <div className="flex flex-col gap-2 px-4 py-3 bg-indigo-50">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={addDraft.name}
                    onChange={e => setAddDraft(d => ({ ...d, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addVendor()}
                    placeholder="Vendor name (required)"
                    autoFocus
                    className="px-3 py-1.5 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={addDraft.category}
                    onChange={e => setAddDraft(d => ({ ...d, category: e.target.value }))}
                    placeholder="Category"
                    list="vendor-category-suggestions"
                    className="px-3 py-1.5 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={addDraft.contactName}
                    onChange={e => setAddDraft(d => ({ ...d, contactName: e.target.value }))}
                    placeholder="Contact name"
                    className="px-3 py-1.5 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={addDraft.phone}
                    onChange={e => setAddDraft(d => ({ ...d, phone: e.target.value }))}
                    placeholder="Phone"
                    className="px-3 py-1.5 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="email"
                    value={addDraft.email}
                    onChange={e => setAddDraft(d => ({ ...d, email: e.target.value }))}
                    placeholder="Email"
                    className="px-3 py-1.5 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={addDraft.website}
                    onChange={e => setAddDraft(d => ({ ...d, website: e.target.value }))}
                    placeholder="Website (e.g. acme.com)"
                    className="px-3 py-1.5 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={addDraft.status}
                    onChange={e => setAddDraft(d => ({ ...d, status: e.target.value as VendorStatus }))}
                    className="px-3 py-1.5 border border-indigo-300 rounded text-sm bg-white focus:outline-none focus:border-indigo-500"
                  >
                    {VENDOR_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <select
                    value={addDraft.owningCommitteeId}
                    onChange={e => setAddDraft(d => ({ ...d, owningCommitteeId: e.target.value }))}
                    className="px-3 py-1.5 border border-indigo-300 rounded text-sm bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">No owning committee</option>
                    {committees.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={addDraft.notes}
                  onChange={e => setAddDraft(d => ({ ...d, notes: e.target.value }))}
                  placeholder="Notes"
                  rows={2}
                  className="px-3 py-1.5 border border-indigo-300 rounded text-sm focus:outline-none focus:border-indigo-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={addVendor}
                    disabled={isAdding || !addDraft.name.trim()}
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </button>
                  <button onClick={() => { setShowAdd(false); setAddDraft(emptyDraft); }} className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3">
                <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                  <Plus className="h-4 w-4" /> Add Vendor
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
