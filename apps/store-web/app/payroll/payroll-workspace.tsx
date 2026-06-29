'use client';

import { useEffect, useState } from 'react';

import { emptyStateStyle, fieldStyle, pageShellStyle, secondaryButtonStyle, surfaceCardStyle, tokenMutedStyle } from '../motocore-theme';

type Employee = {
  id: string;
  full_name: string;
  mobile_no?: string | null;
  email?: string | null;
  role_code: string;
  employment_status: string;
  join_date: string;
  monthly_salary: string | number;
};

type PayrollRun = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_amount: string | number;
  item_count: number;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  return payload as T;
}

export function PayrollWorkspace() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [message, setMessage] = useState('Payroll workflow is ready.');
  const [loading, setLoading] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    fullName: '',
    mobileNo: '',
    email: '',
    roleCode: 'store_manager',
    employmentStatus: 'active',
    joinDate: new Date().toISOString().slice(0, 10),
    monthlySalary: '',
    note: '',
  });
  const [runForm, setRunForm] = useState({
    periodStart: new Date().toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    status: 'draft',
    note: '',
  });

  const refresh = async () => {
    const [employeesPayload, runsPayload] = await Promise.all([
      readJson<{ employees: Employee[] }>('/api/store-ops/payroll/employees'),
      readJson<{ payrollRuns: PayrollRun[] }>('/api/store-ops/payroll/runs'),
    ]);
    setEmployees(employeesPayload.employees ?? []);
    setRuns(runsPayload.payrollRuns ?? []);
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const saveEmployee = async () => {
    if (!employeeForm.fullName.trim()) {
      setMessage('Employee name is required.');
      return;
    }
    setLoading(true);
    try {
      await readJson('/api/store-ops/payroll/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...employeeForm,
          monthlySalary: Number(employeeForm.monthlySalary || 0),
          mobileNo: employeeForm.mobileNo || undefined,
          email: employeeForm.email || undefined,
          note: employeeForm.note || undefined,
        }),
      });
      await refresh();
      setEmployeeForm({
        fullName: '',
        mobileNo: '',
        email: '',
        roleCode: 'store_manager',
        employmentStatus: 'active',
        joinDate: new Date().toISOString().slice(0, 10),
        monthlySalary: '',
        note: '',
      });
      setMessage('Employee saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const createRun = async () => {
    if (!employees.length) {
      setMessage('Add employees before creating a payroll run.');
      return;
    }
    setLoading(true);
    try {
      await readJson('/api/store-ops/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodStart: runForm.periodStart,
          periodEnd: runForm.periodEnd,
          status: runForm.status,
          note: runForm.note || undefined,
          items: employees.map((employee) => ({
            employeeId: employee.id,
            grossAmount: Number(employee.monthly_salary || 0),
            bonusAmount: 0,
            deductionAmount: 0,
          })),
        }),
      });
      await refresh();
      setMessage('Payroll run created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateRunStatus = async (runId: string, status: 'draft' | 'approved' | 'paid') => {
    setLoading(true);
    try {
      await readJson(`/api/store-ops/payroll/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await refresh();
      setMessage(`Payroll run marked ${status}.`);
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
          <h3 style={{ marginTop: 0 }}>Employee Register</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <input value={employeeForm.fullName} onChange={(event) => setEmployeeForm((current) => ({ ...current, fullName: event.target.value }))} style={fieldStyle} placeholder="Full name" />
            <input value={employeeForm.mobileNo} onChange={(event) => setEmployeeForm((current) => ({ ...current, mobileNo: event.target.value }))} style={fieldStyle} placeholder="Mobile" />
            <input value={employeeForm.email} onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))} style={fieldStyle} placeholder="Email (optional)" />
            <select value={employeeForm.roleCode} onChange={(event) => setEmployeeForm((current) => ({ ...current, roleCode: event.target.value }))} style={fieldStyle}>
              <option value="store_owner">Store Owner</option>
              <option value="store_manager">Manager</option>
              <option value="store_salesman">Salesman</option>
            </select>
            <input type="date" value={employeeForm.joinDate} onChange={(event) => setEmployeeForm((current) => ({ ...current, joinDate: event.target.value }))} style={fieldStyle} />
            <input value={employeeForm.monthlySalary} onChange={(event) => setEmployeeForm((current) => ({ ...current, monthlySalary: event.target.value }))} style={fieldStyle} placeholder="Monthly salary" />
            <button onClick={saveEmployee} style={secondaryButtonStyle} disabled={loading}>Save Employee</button>
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Employees</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {employees.length ? employees.map((employee) => (
              <article key={employee.id} style={{ ...surfaceCardStyle, padding: 14 }}>
                <div style={{ fontWeight: 600 }}>{employee.full_name}</div>
                <div style={{ color: '#475569' }}>{employee.role_code} · {employee.employment_status}</div>
                <div style={{ color: '#64748b' }}>
                  {employee.mobile_no || 'No mobile'} · {employee.email || 'No email'} · Salary: {employee.monthly_salary}
                </div>
              </article>
            )) : <div style={emptyStateStyle}>No employees added yet.</div>}
          </div>
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(420px, 1.1fr)', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Create Payroll Run</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <input type="date" value={runForm.periodStart} onChange={(event) => setRunForm((current) => ({ ...current, periodStart: event.target.value }))} style={fieldStyle} />
            <input type="date" value={runForm.periodEnd} onChange={(event) => setRunForm((current) => ({ ...current, periodEnd: event.target.value }))} style={fieldStyle} />
            <select value={runForm.status} onChange={(event) => setRunForm((current) => ({ ...current, status: event.target.value }))} style={fieldStyle}>
              <option value="draft">Draft</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </select>
            <textarea value={runForm.note} onChange={(event) => setRunForm((current) => ({ ...current, note: event.target.value }))} style={{ ...fieldStyle, minHeight: 88 }} placeholder="Payroll note" />
            <button onClick={createRun} style={secondaryButtonStyle} disabled={loading}>Create Payroll Run</button>
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Payroll Runs</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {runs.length ? runs.map((run) => (
              <article key={run.id} style={{ ...surfaceCardStyle, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>{run.period_start} to {run.period_end}</strong>
                  <span>{run.total_amount}</span>
                </div>
                <div style={{ color: '#475569' }}>{run.status} · {run.item_count} employee(s)</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => void updateRunStatus(run.id, 'approved')} style={secondaryButtonStyle} disabled={loading}>Approve</button>
                  <button onClick={() => void updateRunStatus(run.id, 'paid')} style={secondaryButtonStyle} disabled={loading}>Mark Paid</button>
                </div>
              </article>
            )) : <div style={emptyStateStyle}>No payroll runs created yet.</div>}
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
