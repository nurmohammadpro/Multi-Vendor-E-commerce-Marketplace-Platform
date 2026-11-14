'use client';

import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

import {
  emptyStateStyle,
  fieldStyle,
  gray800ButtonStyle,
  sectionPanelStyle,
  pageShellStyle,
  searchButtonStyle,
  subtleButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../merchflow-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';
import { useCompactLayout } from '../workspace-responsive';

type Expense = {
  id: string;
  expense_date: string;
  category_name: string;
  title: string;
  amount: string | number;
  payment_method: string;
  status: string;
  note?: string | null;
};

type ExpenseCategory = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
  return payload as T;
}

export function ExpensesWorkspace() {
  const compact = useCompactLayout();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedExpenseId, setSelectedExpenseId] = useState('');
  const [message, setMessage] = useState('Daily expense workflow is ready.');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 12, total: 0 });
  const [form, setForm] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    categoryName: '',
    title: '',
    amount: '',
    paymentMethod: 'cash',
    status: 'draft',
    note: '',
  });

  // ── Export state ──
  const [exportMode, setExportMode] = useState<'monthly' | 'daterange'>('monthly');
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [exportStartDate, setExportStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);

  const loadCategories = async () => {
    try {
      const payload = await readJson<{ categories: ExpenseCategory[] }>('/api/store-ops/expense-categories');
      setCategories(payload.categories ?? []);
    } catch {
      // categories are optional
    }
  };

  const refresh = async (nextPage = 1) => {
    const params = new URLSearchParams({ page: String(nextPage), limit: String(pagination.limit) });
    if (search.trim()) params.set('search', search.trim());
    const payload = await readJson<{ expenses: Expense[]; pagination?: PaginationState }>(`/api/store-ops/expenses?${params.toString()}`);
    setExpenses(payload.expenses ?? []);
    setPagination(payload.pagination ?? { page: nextPage, limit: pagination.limit, total: payload.expenses?.length ?? 0 });
    setPage(payload.pagination?.page ?? nextPage);
  };

  useEffect(() => {
    void Promise.all([refresh(), loadCategories()]).catch((error: Error) => setMessage(error.message));
  }, []);

  const activeCategories = categories.filter((c) => c.status === 'active');
  const hasCategories = activeCategories.length > 0;

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await readJson('/api/store-ops/expense-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setNewCategoryName('');
      await loadCategories();
      setMessage(`Category "${name}" created.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const toggleCategoryStatus = async (category: ExpenseCategory) => {
    const nextStatus = category.status === 'active' ? 'archived' : 'active';
    try {
      await readJson(`/api/store-ops/expense-categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadCategories();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const saveExpense = async () => {
    if (!form.title.trim() || !form.amount) {
      setMessage('Title and amount are required.');
      return;
    }
    setLoading(true);
    try {
      const endpoint = selectedExpenseId ? `/api/store-ops/expenses/${selectedExpenseId}` : '/api/store-ops/expenses';
      await readJson(endpoint, {
        method: selectedExpenseId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenseDate: form.expenseDate,
          categoryName: form.categoryName,
          title: form.title,
          amount: Number(form.amount),
          paymentMethod: form.paymentMethod,
          status: form.status,
          note: form.note || undefined,
        }),
      });
      await refresh(1);
      setSelectedExpenseId('');
      setForm({ expenseDate: new Date().toISOString().slice(0, 10), categoryName: '', title: '', amount: '', paymentMethod: 'cash', status: 'draft', note: '' });
      setMessage('Expense saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ── Export helpers ──

  /** Return { startDate, endDate } based on current export mode */
  const exportDateRange = useMemo(() => {
    if (exportMode === 'monthly') {
      const start = `${exportMonth}-01`;
      const lastDay = new Date(Number(exportMonth.slice(0, 4)), Number(exportMonth.slice(5, 7)), 0).getDate();
      return { startDate: start, endDate: `${exportMonth}-${String(lastDay).padStart(2, '0')}` };
    }
    return { startDate: exportStartDate, endDate: exportEndDate };
  }, [exportMode, exportMonth, exportStartDate, exportEndDate]);

  const fetchExportData = async () => {
    const { startDate, endDate } = exportDateRange;
    const params = new URLSearchParams({ startDate, endDate, limit: '5000' });
    const payload = await readJson<{ expenses: Expense[] }>(`/api/store-ops/expenses?${params.toString()}`);
    return payload.expenses ?? [];
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const data = await fetchExportData();
      if (!data.length) { setMessage('No expenses found for this period.'); return; }

      const rows = data.map((e) => [
        e.expense_date,
        `"${e.title.replace(/"/g, '""')}"`,
        `"${e.category_name.replace(/"/g, '""')}"`,
        e.payment_method,
        e.status,
        Number(e.amount).toFixed(2),
      ]);
      const csv = [
        '﻿Date,Title,Category,Method,Status,Amount',
        ...rows.map((r) => r.join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const { startDate, endDate } = exportDateRange;
      a.download = `expenses-${startDate}_to_${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${data.length} expense(s) as CSV.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      const data = await fetchExportData();
      if (!data.length) { setMessage('No expenses found for this period.'); return; }

      const { startDate, endDate } = exportDateRange;
      const total = data.reduce((s, e) => s + Number(e.amount), 0);

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(16);
      doc.text('Expense Report', pageWidth / 2, 16, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`Period: ${startDate} to ${endDate}`, pageWidth / 2, 23, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleDateString('en-BD', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, 29, { align: 'center' });

      // Table
      const tableData = data.map((e) => [
        e.expense_date,
        e.title,
        e.category_name,
        e.payment_method,
        e.status,
        Number(e.amount).toFixed(2),
      ]);

      (doc as any).autoTable({
        startY: 34,
        head: [['Date', 'Title', 'Category', 'Method', 'Status', 'Amount']],
        body: tableData,
        foot: [['', '', '', '', 'Total', total.toFixed(2)]],
        theme: 'grid',
        headStyles: { fillColor: [41, 41, 41], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        footStyles: { fillColor: [245, 245, 245], textColor: [41, 41, 41], fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [252, 252, 252] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 28 },
          3: { cellWidth: 20 },
          4: { cellWidth: 16 },
          5: { cellWidth: 20, halign: 'right' },
        },
        margin: { left: 10, right: 10 },
      });

      doc.save(`expenses-${startDate}_to_${endDate}.pdf`);
      setMessage(`Exported ${data.length} expense(s) as PDF.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = totalPagesFor(pagination);

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 10 }}>
          <section style={{ ...sectionPanelStyle, gridTemplateColumns: compact ? '1fr' : 'minmax(320px, 0.9fr) minmax(320px, 0.9fr)' }}>
            <article style={surfaceCardStyle}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Record Expense</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <input type="date" value={form.expenseDate} onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))} style={fieldStyle} />
            {hasCategories ? (
              <select value={form.categoryName} onChange={(event) => setForm((current) => ({ ...current, categoryName: event.target.value }))} style={fieldStyle}>
                <option value="">Select category...</option>
                {activeCategories.map((cat) => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            ) : (
              <input value={form.categoryName} onChange={(event) => setForm((current) => ({ ...current, categoryName: event.target.value }))} style={fieldStyle} placeholder="Category" />
            )}
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} style={fieldStyle} placeholder="Expense title" />
            <input value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} style={fieldStyle} placeholder="Amount" />
            <select value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))} style={fieldStyle}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mfs">MFS</option>
              <option value="bank_transfer">Bank</option>
            </select>
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} style={fieldStyle}>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="void">Void</option>
            </select>
            <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} style={{ ...fieldStyle, minHeight: 90 }} placeholder="Note" />
            <button onClick={saveExpense} style={gray800ButtonStyle} disabled={loading}>{selectedExpenseId ? 'Update Expense' : 'Save Expense'}</button>
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Expense Categories</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              data-enter-nav="false"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addCategory(); }}
              style={{ ...fieldStyle, flex: 1 }}
              placeholder="New category name"
            />
            <button onClick={() => void addCategory()} style={gray800ButtonStyle}>Add</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {categories.length === 0 && (
              <span style={tokenMutedStyle}>No categories yet. Create one above.</span>
            )}
            {categories.map((cat) => (
              <span
                key={cat.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: `1px solid ${cat.status === 'active' ? 'var(--accent)' : 'var(--border)'}`,
                  background: cat.status === 'active' ? 'var(--accent-soft)' : 'var(--card)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: cat.status === 'active' ? 'var(--accent-deep)' : 'var(--muted-foreground)',
                  opacity: cat.status === 'archived' ? 0.6 : 1,
                }}
              >
                {cat.name}
                {cat.status === 'active' ? (
                  <button
                    onClick={() => void toggleCategoryStatus(cat)}
                    style={{ ...subtleButtonStyle, minHeight: 18, padding: '0 4px', fontSize: 11, lineHeight: '18px', color: 'var(--muted-foreground)' }}
                    title="Archive"
                  >
                    ✕
                  </button>
                ) : (
                  <button
                    onClick={() => void toggleCategoryStatus(cat)}
                    style={{ ...subtleButtonStyle, minHeight: 18, padding: '0 4px', fontSize: 11, lineHeight: '18px' }}
                    title="Restore"
                  >
                    restore
                  </button>
                )}
              </span>
            ))}
          </div>
        </article>
      </section>

      <section style={sectionPanelStyle}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Expenses</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void refresh(1); }} style={{ ...fieldStyle, flex: 1 }} placeholder="Search title, category, method, or status" />
            <button onClick={() => void refresh(1)} style={searchButtonStyle} disabled={loading}>Search</button>
          </div>

          {/* ── Export section ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12, padding: 8, background: 'var(--muted)', borderRadius: 6 }}>
            <select value={exportMode} onChange={(e) => setExportMode(e.target.value as 'monthly' | 'daterange')} style={{ ...fieldStyle, width: 'auto', minWidth: 120, fontSize: 12 }}>
              <option value="monthly">Monthly</option>
              <option value="daterange">Date range</option>
            </select>
            {exportMode === 'monthly' ? (
              <input type="month" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} style={{ ...fieldStyle, width: 'auto', fontSize: 12 }} />
            ) : (
              <>
                <input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} style={{ ...fieldStyle, width: 'auto', fontSize: 12 }} />
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>to</span>
                <input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} style={{ ...fieldStyle, width: 'auto', fontSize: 12 }} />
              </>
            )}
            <button onClick={() => void exportCSV()} style={{ ...gray800ButtonStyle, fontSize: 12 }} disabled={exporting}>CSV</button>
            <button onClick={() => void exportPDF()} style={{ ...gray800ButtonStyle, fontSize: 12 }} disabled={exporting}>PDF</button>
          </div>

          {expenses.length ? (
            <>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Date</th>
                      <th style={tableHeaderCellStyle}>Title</th>
                      <th style={tableHeaderCellStyle}>Category</th>
                      <th style={tableHeaderCellStyle}>Method</th>
                      <th style={tableHeaderCellStyle}>Status</th>
                      <th style={tableHeaderCellStyle}>Amount</th>
                      <th style={tableHeaderCellStyle}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((expense) => (
                      <tr key={expense.id}>
                        <td style={tableCellStyle}>{expense.expense_date}</td>
                        <td style={tableCellStyle}>{expense.title}</td>
                        <td style={tableCellStyle}>{expense.category_name}</td>
                        <td style={tableCellStyle}>{expense.payment_method}</td>
                        <td style={tableCellStyle}>{expense.status}</td>
                        <td style={{ ...tableCellStyle, fontWeight: 600 }}>{expense.amount}</td>
                        <td style={tableCellStyle}>
                          <button
                            onClick={() => {
                              setSelectedExpenseId(expense.id);
                              setForm({
                                expenseDate: expense.expense_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
                                categoryName: expense.category_name,
                                title: expense.title,
                                amount: String(expense.amount),
                                paymentMethod: expense.payment_method,
                                status: expense.status,
                                note: expense.note || '',
                              });
                            }}
                            style={subtleButtonStyle}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                loading={loading}
                page={page}
                pagination={pagination}
                label="expense(s)"
                onPrevious={() => void refresh(Math.max(1, page - 1))}
                onNext={() => void refresh(Math.min(totalPages, page + 1))}
              />
            </>
          ) : <div style={emptyStateStyle}>No expenses recorded yet.</div>}
        </article>
      </section>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Operator Notes</h3>
          <p style={tokenMutedStyle}>{message}</p>
        </article>
    </section>
  );
}
