'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Loader2, ArrowLeft, Printer, Download, Settings2, X, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { ColumnType } from '@/lib/list-templates';

interface Column {
  id: string;
  label: string;
  type: ColumnType;
  options: string[];
  position: number;
}

interface Row {
  id: string;
  cells: Record<string, unknown>;
  position: number;
}

const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Dropdown',
  checkbox: 'Checkbox',
  person: 'Person',
  link: 'Link / URL',
};

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export default function ListDetail() {
  const params = useParams();
  const committeeId = (params.id as string) ?? '';
  const listId = (params.listId as string) ?? '';
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, isCommitteeHead } = useAuth();

  const [listName, setListName] = useState('');
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [draftCells, setDraftCells] = useState<Record<string, unknown> | null>(null);
  const [isSavingRow, setIsSavingRow] = useState(false);

  // New-column form (heads only)
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('text');
  const [newColOptions, setNewColOptions] = useState('');

  const isHead = isCommitteeHead(committeeId);

  // `silent` skips the full-page loading spinner — used for background
  // refreshes (realtime events, post-save re-fetches) so the screen doesn't
  // flash back to a loading state every time data changes.
  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!listId || !user) return;
    if (!opts.silent) setIsLoading(true);
    const { data: list, error } = await supabase.from('committee_lists').select('id, name').eq('id', listId).single();
    if (error || !list) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }
    setListName(list.name);

    const [{ data: colRows }, { data: rowRows }] = await Promise.all([
      supabase.from('committee_list_columns').select('id, label, type, options, position').eq('list_id', listId).order('position'),
      supabase.from('committee_list_rows').select('id, cells, position').eq('list_id', listId).order('position').order('created_at'),
    ]);
    setColumns((colRows ?? []) as Column[]);
    setRows((rowRows ?? []) as Row[]);
    setIsLoading(false);
  }, [listId, user, supabase]);

  useEffect(() => { load(); }, [load]);

  // Live updates so everyone editing the list sees changes without refreshing.
  useEffect(() => {
    if (!listId) return;
    const silentReload = () => load({ silent: true });
    const channel = supabase
      .channel(`list-${listId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'committee_list_rows', filter: `list_id=eq.${listId}` }, silentReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'committee_list_columns', filter: `list_id=eq.${listId}` }, silentReload)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [listId, supabase, load]);

  // --- Rows (any committee member) ---
  const addRow = async () => {
    const position = rows.length;
    const { data, error } = await supabase
      .from('committee_list_rows')
      .insert({ list_id: listId, cells: {}, position, created_by: profile?.id })
      .select('id, cells, position')
      .single();
    if (!error && data) {
      setRows(prev => [...prev, data as Row]);
    } else {
      toast.error('Could not add row.');
    }
  };

  // Row editing: nothing writes to the DB until Save is clicked. Edits are
  // held in `draftCells` while `editingRowId` marks which row is open.
  const startEditRow = (row: Row) => {
    setEditingRowId(row.id);
    setDraftCells({ ...row.cells });
  };

  const cancelEditRow = () => {
    setEditingRowId(null);
    setDraftCells(null);
  };

  const updateDraftCell = (columnId: string, value: unknown) => {
    setDraftCells(prev => (prev ? { ...prev, [columnId]: value } : prev));
  };

  const saveRowEdit = async () => {
    if (!editingRowId || !draftCells) return;
    setIsSavingRow(true);
    const { error } = await supabase.from('committee_list_rows').update({ cells: draftCells }).eq('id', editingRowId);
    setIsSavingRow(false);
    if (error) {
      toast.error('That change was not saved.');
    } else {
      setRows(prev => prev.map(r => (r.id === editingRowId ? { ...r, cells: draftCells } : r)));
      toast.success('Saved');
    }
    cancelEditRow();
  };

  const deleteRow = async (rowId: string) => {
    setRows(prev => prev.filter(r => r.id !== rowId));
    const { error } = await supabase.from('committee_list_rows').delete().eq('id', rowId);
    if (error) toast.error('Could not delete row.');
  };

  // --- Columns (heads/admins only) ---
  const addColumn = async () => {
    if (!newColLabel.trim()) return;
    const options = newColType === 'select'
      ? newColOptions.split(',').map(o => o.trim()).filter(Boolean)
      : [];
    const { data, error } = await supabase
      .from('committee_list_columns')
      .insert({ list_id: listId, label: newColLabel.trim(), type: newColType, options, position: columns.length })
      .select('id, label, type, options, position')
      .single();
    if (!error && data) {
      setColumns(prev => [...prev, data as Column]);
      setNewColLabel('');
      setNewColType('text');
      setNewColOptions('');
      toast.success('Column added');
    } else {
      toast.error('Could not add column.');
    }
  };

  const deleteColumn = async (columnId: string) => {
    setColumns(prev => prev.filter(c => c.id !== columnId));
    const { error } = await supabase.from('committee_list_columns').delete().eq('id', columnId);
    if (error) toast.error('Could not delete column.');
  };

  const exportCsv = () => {
    const header = columns.map(c => csvEscape(c.label)).join(',');
    const body = rows.map(r =>
      columns.map(c => {
        const v = r.cells[c.id];
        if (v === true) return 'Yes';
        if (v === false || v === undefined || v === null) return '';
        return csvEscape(String(v));
      }).join(',')
    );
    const csv = [header, ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${listName.replace(/[^a-z0-9]+/gi, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Read-only display of a cell's value (used outside edit mode).
  const renderCellValue = (row: Row, col: Column) => {
    const value = row.cells[col.id];
    if (col.type === 'checkbox') {
      return <input type="checkbox" checked={value === true} disabled className="w-4 h-4 rounded" />;
    }
    const display = value === undefined || value === null ? '' : String(value);
    if (col.type === 'link' && display) {
      return <a href={display} target="_blank" rel="noreferrer" className="px-2 py-1.5 text-sm text-indigo-600 hover:underline block truncate">{display}</a>;
    }
    return <p className="px-2 py-1.5 text-sm text-gray-700 truncate">{display || '—'}</p>;
  };

  // Editable cell — reads from and writes to `draftCells`, not the row itself.
  const renderCellEditor = (col: Column) => {
    const value = draftCells?.[col.id];
    const base = 'w-full px-2 py-1.5 text-sm bg-white border border-indigo-300 rounded focus:outline-none focus:border-indigo-500';
    switch (col.type) {
      case 'checkbox':
        return (
          <input type="checkbox" checked={value === true} onChange={e => updateDraftCell(col.id, e.target.checked)} className="w-4 h-4 rounded" />
        );
      case 'number':
        return <input type="number" value={value === undefined || value === null ? '' : String(value)} onChange={e => updateDraftCell(col.id, e.target.value)} className={base} />;
      case 'date':
        return <input type="date" value={typeof value === 'string' ? value : ''} onChange={e => updateDraftCell(col.id, e.target.value)} className={base} />;
      case 'select':
        return (
          <select value={typeof value === 'string' ? value : ''} onChange={e => updateDraftCell(col.id, e.target.value)} className={base}>
            <option value="">—</option>
            {col.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case 'link':
        return <input type="text" value={typeof value === 'string' ? value : ''} onChange={e => updateDraftCell(col.id, e.target.value)} placeholder="https://…" className={base} />;
      default:
        return <input type="text" value={typeof value === 'string' ? value : ''} onChange={e => updateDraftCell(col.id, e.target.value)} className={base} />;
    }
  };

  const renderPrintValue = (row: Row, col: Column) => {
    const v = row.cells[col.id];
    if (col.type === 'checkbox') return v === true ? '✓' : '';
    if (v === undefined || v === null) return '';
    return String(v);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-3">This list doesn&apos;t exist or you don&apos;t have access.</p>
          <Link href={`/committee/${committeeId}/lists`} className="text-indigo-600 hover:text-indigo-700 font-medium">Back to lists</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 print:bg-white print:py-0">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Toolbar — hidden when printing */}
        <div className="print:hidden">
          <Link href={`/committee/${committeeId}/lists`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
            <ArrowLeft className="h-4 w-4" /> Back to lists
          </Link>
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <h1 className="text-3xl font-bold text-gray-900">{listName}</h1>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <Printer className="h-4 w-4" /> Print
              </button>
              <button onClick={exportCsv} className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <Download className="h-4 w-4" /> Export CSV
              </button>
              {isHead && (
                <button onClick={() => setShowColumnManager(!showColumnManager)} className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border ${showColumnManager ? 'bg-gray-800 text-white border-gray-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  <Settings2 className="h-4 w-4" /> Columns
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Print-only heading */}
        <h1 className="hidden print:block text-2xl font-bold mb-4">{listName}</h1>

        {/* Column manager (heads only) */}
        {showColumnManager && isHead && (
          <div className="bg-white rounded-lg shadow-sm p-5 mb-5 print:hidden">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Manage columns</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {columns.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1.5 bg-gray-100 rounded-full pl-3 pr-1.5 py-1 text-sm text-gray-700">
                  {c.label} <span className="text-xs text-gray-400">({COLUMN_TYPE_LABELS[c.type]})</span>
                  <button onClick={() => deleteColumn(c.id)} className="p-0.5 hover:bg-red-100 hover:text-red-600 rounded-full" title="Delete column"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              {columns.length === 0 && <span className="text-sm text-gray-400">No columns yet — add one below.</span>}
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t pt-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Column name</label>
                <input type="text" value={newColLabel} onChange={e => setNewColLabel(e.target.value)} placeholder="e.g., Email" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <select value={newColType} onChange={e => setNewColType(e.target.value as ColumnType)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-400">
                  {(Object.keys(COLUMN_TYPE_LABELS) as ColumnType[]).map(t => <option key={t} value={t}>{COLUMN_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              {newColType === 'select' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Choices (comma-separated)</label>
                  <input type="text" value={newColOptions} onChange={e => setNewColOptions(e.target.value)} placeholder="Confirmed, Pending, Declined" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
                </div>
              )}
              <button onClick={addColumn} disabled={!newColLabel.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> Add column
              </button>
            </div>
          </div>
        )}

        {/* The table */}
        {columns.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-10 text-center text-gray-500 print:hidden">
            This list has no columns yet. {isHead ? 'Click "Columns" above to add some.' : 'A committee head needs to set up the columns.'}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto print:shadow-none">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-800 print:bg-white">
                  {columns.map(col => (
                    <th key={col.id} className="text-left px-3 py-2.5 text-xs font-semibold text-slate-200 uppercase tracking-wide whitespace-nowrap border border-slate-700 print:text-black print:border-gray-400">
                      {col.label}
                    </th>
                  ))}
                  <th className="w-10 print:hidden bg-slate-800"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isEditing = editingRowId === row.id;
                  return (
                    <tr key={row.id} className={`border-b print:hover:bg-white ${isEditing ? 'bg-indigo-50/60' : 'hover:bg-gray-50/50'}`}>
                      {columns.map(col => (
                        <td key={col.id} className="px-1 py-0.5 border print:border-gray-300 print:px-2 print:py-1 align-top">
                          <span className="hidden print:inline text-sm">{renderPrintValue(row, col)}</span>
                          <span className="print:hidden">{isEditing ? renderCellEditor(col) : renderCellValue(row, col)}</span>
                        </td>
                      ))}
                      <td className="text-center print:hidden whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={saveRowEdit} disabled={isSavingRow} title="Save" className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
                              {isSavingRow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            </button>
                            <button onClick={cancelEditRow} disabled={isSavingRow} title="Cancel" className="p-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => startEditRow(row)} className="p-1 text-gray-300 hover:text-indigo-500 rounded transition-colors" title="Edit row">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteRow(row.id)} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors" title="Delete row">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-sm text-gray-400">No rows yet. Add one below.</td></tr>
                )}
              </tbody>
            </table>
            <div className="p-3 print:hidden">
              <button onClick={addRow} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium">
                <Plus className="h-4 w-4" /> Add row
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
