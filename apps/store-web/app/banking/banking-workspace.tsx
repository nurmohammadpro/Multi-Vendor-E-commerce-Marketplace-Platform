'use client';

import { useEffect, useState } from 'react';

import {
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  secondaryButtonStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../motocore-theme';

type BankAccount = {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  opening_balance: string | number;
  current_balance: string | number;
  status: string;
  note?: string | null;
};

type BankEntry = {
  id: string;
  account_name: string;
  bank_name: string;
  entry_date: string;
  entry_type: string;
  source_type: string;
  reference_no?: string | null;
  amount: string | number;
  status: string;
  note?: string | null;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  return payload as T;
}

export function BankingWorkspace() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [message, setMessage] = useState('Banking reconciliation is ready.');
  const [loading, setLoading] = useState(false);
  const [accountForm, setAccountForm] = useState({
    accountName: '',
    bankName: '',
    accountNumber: '',
    openingBalance: '',
    currentBalance: '',
    status: 'active',
    note: '',
  });
  const [entryForm, setEntryForm] = useState({
    bankAccountId: '',
    entryDate: new Date().toISOString().slice(0, 10),
    entryType: 'credit',
    sourceType: 'sale',
    referenceNo: '',
    amount: '',
    status: 'pending',
    note: '',
  });

  const refresh = async () => {
    const [accountsPayload, entriesPayload] = await Promise.all([
      readJson<{ bankAccounts: BankAccount[] }>('/api/store-ops/banking/accounts'),
      readJson<{ entries: BankEntry[] }>('/api/store-ops/banking/entries'),
    ]);
    setAccounts(accountsPayload.bankAccounts ?? []);
    setEntries(entriesPayload.entries ?? []);
    setEntryForm((current) => ({ ...current, bankAccountId: current.bankAccountId || accountsPayload.bankAccounts?.[0]?.id || '' }));
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const saveAccount = async () => {
    if (!accountForm.accountName.trim() || !accountForm.bankName.trim() || !accountForm.accountNumber.trim()) {
      setMessage('Account name, bank name, and account number are required.');
      return;
    }
    setLoading(true);
    try {
      await readJson('/api/store-ops/banking/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...accountForm,
          openingBalance: Number(accountForm.openingBalance || 0),
          currentBalance: Number(accountForm.currentBalance || 0),
          note: accountForm.note || undefined,
        }),
      });
      await refresh();
      setAccountForm({
        accountName: '',
        bankName: '',
        accountNumber: '',
        openingBalance: '',
        currentBalance: '',
        status: 'active',
        note: '',
      });
      setMessage('Bank account saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveEntry = async () => {
    if (!entryForm.bankAccountId || !entryForm.amount) {
      setMessage('Select a bank account and amount first.');
      return;
    }
    setLoading(true);
    try {
      await readJson('/api/store-ops/banking/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...entryForm,
          amount: Number(entryForm.amount),
          referenceNo: entryForm.referenceNo || undefined,
          note: entryForm.note || undefined,
        }),
      });
      await refresh();
      setEntryForm((current) => ({
        ...current,
        entryDate: new Date().toISOString().slice(0, 10),
        referenceNo: '',
        amount: '',
        status: 'pending',
        note: '',
      }));
      setMessage('Reconciliation entry saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ ...pageShellStyle, display: 'grid', gap: 16 }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.95fr) minmax(420px, 1.05fr)', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Bank Accounts</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <input value={accountForm.accountName} onChange={(event) => setAccountForm((current) => ({ ...current, accountName: event.target.value }))} style={fieldStyle} placeholder="Account name" />
            <input value={accountForm.bankName} onChange={(event) => setAccountForm((current) => ({ ...current, bankName: event.target.value }))} style={fieldStyle} placeholder="Bank name" />
            <input value={accountForm.accountNumber} onChange={(event) => setAccountForm((current) => ({ ...current, accountNumber: event.target.value }))} style={fieldStyle} placeholder="Account number" />
            <input value={accountForm.openingBalance} onChange={(event) => setAccountForm((current) => ({ ...current, openingBalance: event.target.value }))} style={fieldStyle} placeholder="Opening balance" />
            <input value={accountForm.currentBalance} onChange={(event) => setAccountForm((current) => ({ ...current, currentBalance: event.target.value }))} style={fieldStyle} placeholder="Current balance" />
            <button onClick={saveAccount} style={secondaryButtonStyle} disabled={loading}>Save Bank Account</button>
          </div>
          {accounts.length ? (
            <div style={{ ...tableWrapStyle, marginTop: 12 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Account</th>
                    <th style={tableHeaderCellStyle}>Bank</th>
                    <th style={tableHeaderCellStyle}>Number</th>
                    <th style={tableHeaderCellStyle}>Opening</th>
                    <th style={tableHeaderCellStyle}>Current</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td style={tableCellStyle}>{account.account_name}</td>
                      <td style={tableCellStyle}>{account.bank_name}</td>
                      <td style={tableCellStyle}>{account.account_number}</td>
                      <td style={tableCellStyle}>{account.opening_balance}</td>
                      <td style={tableCellStyle}>{account.current_balance}</td>
                      <td style={tableCellStyle}>{account.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={emptyStateStyle}>No bank accounts saved yet.</div>}
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Reconciliation Entries</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <select value={entryForm.bankAccountId} onChange={(event) => setEntryForm((current) => ({ ...current, bankAccountId: event.target.value }))} style={fieldStyle}>
              <option value="">Select bank account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.account_name} · {account.bank_name}</option>
              ))}
            </select>
            <input type="date" value={entryForm.entryDate} onChange={(event) => setEntryForm((current) => ({ ...current, entryDate: event.target.value }))} style={fieldStyle} />
            <select value={entryForm.entryType} onChange={(event) => setEntryForm((current) => ({ ...current, entryType: event.target.value }))} style={fieldStyle}>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
            <select value={entryForm.sourceType} onChange={(event) => setEntryForm((current) => ({ ...current, sourceType: event.target.value }))} style={fieldStyle}>
              <option value="sale">Sale</option>
              <option value="expense">Expense</option>
              <option value="deposit">Deposit</option>
              <option value="adjustment">Adjustment</option>
            </select>
            <input value={entryForm.referenceNo} onChange={(event) => setEntryForm((current) => ({ ...current, referenceNo: event.target.value }))} style={fieldStyle} placeholder="Reference no" />
            <input value={entryForm.amount} onChange={(event) => setEntryForm((current) => ({ ...current, amount: event.target.value }))} style={fieldStyle} placeholder="Amount" />
            <select value={entryForm.status} onChange={(event) => setEntryForm((current) => ({ ...current, status: event.target.value }))} style={fieldStyle}>
              <option value="pending">Pending</option>
              <option value="matched">Matched</option>
              <option value="flagged">Flagged</option>
            </select>
            <button onClick={saveEntry} style={secondaryButtonStyle} disabled={loading}>Save Entry</button>
          </div>
          {entries.length ? (
            <div style={{ ...tableWrapStyle, marginTop: 12 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Account</th>
                    <th style={tableHeaderCellStyle}>Date</th>
                    <th style={tableHeaderCellStyle}>Type</th>
                    <th style={tableHeaderCellStyle}>Source</th>
                    <th style={tableHeaderCellStyle}>Amount</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                    <th style={tableHeaderCellStyle}>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td style={tableCellStyle}>{entry.account_name}</td>
                      <td style={tableCellStyle}>{entry.entry_date}</td>
                      <td style={tableCellStyle}>{entry.entry_type}</td>
                      <td style={tableCellStyle}>{entry.source_type}</td>
                      <td style={tableCellStyle}>{entry.amount}</td>
                      <td style={tableCellStyle}>{entry.status}</td>
                      <td style={tableCellStyle}>{entry.reference_no || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={emptyStateStyle}>No reconciliation entries saved yet.</div>}
        </article>
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
