'use client';

import { useEffect, useState } from 'react';

import { emptyStateStyle, fieldStyle, pageShellStyle, secondaryButtonStyle, surfaceCardStyle, tokenMutedStyle } from '../motocore-theme';

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
  const [form, setForm] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    categoryName: 'Utility',
    title: '',
    amount: '',
    paymentMethod: 'cash',
    status: 'draft',
    note: '',
  });

  const refresh = async () => {
    const payload = await readJson<{ expenses: Expense[] }>('/api/store-ops/expenses');
    setExpenses(payload.expenses ?? []);
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
      await refresh();
      setSelectedExpenseId('');
      setForm({
        expenseDate: new Date().toISOString().slice(0, 10),
        categoryName: 'Utility',
        title: '',
        amount: '',
        paymentMethod: 'cash',
        status: 'draft',
        note: '',
      });
      setMessage('Expense saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(420px, 1.1fr)', gap: 16 }}>
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
            <button onClick={saveExpense} style={secondaryButtonStyle} disabled={loading}>{selectedExpenseId ? 'Update Expense' : 'Save Expense'}</button>
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Recent Expenses</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {expenses.length ? expenses.map((expense) => (
              <button
                key={expense.id}
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
                style={{ ...surfaceCardStyle, padding: 14, textAlign: 'left' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>{expense.title}</strong>
                  <span>{expense.amount}</span>
                </div>
                <div style={{ color: '#475569' }}>{expense.category_name} · {expense.payment_method} · {expense.status}</div>
                <div style={{ color: '#64748b' }}>{expense.expense_date}</div>
              </button>
            )) : <div style={emptyStateStyle}>No expenses recorded yet.</div>}
          </div>
        </article>
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
