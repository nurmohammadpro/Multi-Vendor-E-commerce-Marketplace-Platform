'use client';

import { useEffect, useState } from 'react';

import {
  accentButtonStyle,
  emptyStateStyle,
  fieldStyle,
  sectionPanelStyle,
  pageShellStyle,
  secondaryButtonStyle,
  subtleButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../motocore-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';

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

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  return payload as T;
}

export function ExpensesWorkspace() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedExpenseId, setSelectedExpenseId] = useState('');
  const [message, setMessage] = useState('Daily expense workflow is ready.');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 12, total: 0 });
  const [form, setForm] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    categoryName: 'Utility',
    title: '',
    amount: '',
    paymentMethod: 'cash',
    status: 'draft',
    note: '',
  });

  const refresh = async (nextPage = 1) => {
    const params = new URLSearchParams({ page: String(nextPage), limit: String(pagination.limit) });
    if (search.trim()) params.set('search', search.trim());
    const payload = await readJson<{ expenses: Expense[]; pagination?: PaginationState }>(`/api/store-ops/expenses?${params.toString()}`);
    setExpenses(payload.expenses ?? []);
    setPagination(payload.pagination ?? { page: nextPage, limit: pagination.limit, total: payload.expenses?.length ?? 0 });
    setPage(payload.pagination?.page ?? nextPage);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

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
      setForm({ expenseDate: new Date().toISOString().slice(0, 10), categoryName: 'Utility', title: '', amount: '', paymentMethod: 'cash', status: 'draft', note: '' });
      setMessage('Expense saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = totalPagesFor(pagination);

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(420px, 1.1fr)' }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Record Expense</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <input type="date" value={form.expenseDate} onChange={(event) => setForm((current) => ({ ...current, expenseDate: event.target.value }))} style={fieldStyle} />
            <input value={form.categoryName} onChange={(event) => setForm((current) => ({ ...current, categoryName: event.target.value }))} style={fieldStyle} placeholder="Category" />
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
            <button onClick={saveExpense} style={accentButtonStyle} disabled={loading}>{selectedExpenseId ? 'Update Expense' : 'Save Expense'}</button>
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Expenses</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, marginBottom: 12 }}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} style={fieldStyle} placeholder="Search title, category, method, or status" />
            <button onClick={() => void refresh(1)} style={secondaryButtonStyle} disabled={loading}>Search</button>
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
                        <td style={tableCellStyle}>{expense.amount}</td>
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
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
