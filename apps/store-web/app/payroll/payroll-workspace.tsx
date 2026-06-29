'use client';

import { useEffect, useMemo, useState } from 'react';

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

type Employee = {
  id: string;
  employee_number?: string | null;
  full_name: string;
  mobile_no?: string | null;
  email?: string | null;
  address_text?: string | null;
  role_code: string;
  employment_status: string;
  join_date: string;
  employment_type?: string | null;
  designation?: string | null;
  department?: string | null;
  monthly_salary: string | number;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  salary_payment_mode?: string | null;
  education_summary?: string | null;
  experience_summary?: string | null;
  training_summary?: string | null;
  note?: string | null;
};

type PayrollRun = {
  id: string;
  payroll_no?: string | null;
  period_start: string;
  period_end: string;
  status: string;
  total_amount: string | number;
  total_bonus_amount?: string | number;
  total_deduction_amount?: string | number;
  total_employees?: number;
  item_count: number;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'error' in payload && payload.error ? payload.error : `Request failed with ${response.status}`);
  return payload as T;
}

const defaultEmployeeForm = {
  fullName: '',
  mobileNo: '',
  email: '',
  addressText: '',
  roleCode: 'store_salesman',
  employmentStatus: 'active',
  joinDate: new Date().toISOString().slice(0, 10),
  employmentType: 'permanent',
  designation: '',
  department: '',
  monthlySalary: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  salaryPaymentMode: 'cash',
  educationSummary: '',
  experienceSummary: '',
  trainingSummary: '',
  note: '',
};

export function PayrollWorkspace() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [message, setMessage] = useState('Payroll workflow is ready.');
  const [loading, setLoading] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(defaultEmployeeForm);
  const [runForm, setRunForm] = useState({
    periodStart: new Date().toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    status: 'draft',
    note: '',
  });
  const [adjustments, setAdjustments] = useState<Record<string, { bonus: string; deduction: string; note: string }>>({});

  const refresh = async () => {
    const [employeesPayload, runsPayload] = await Promise.all([
      readJson<{ employees: Employee[] }>('/api/store-ops/payroll/employees'),
      readJson<{ payrollRuns: PayrollRun[] }>('/api/store-ops/payroll/runs'),
    ]);
    const nextEmployees = employeesPayload.employees ?? [];
    setEmployees(nextEmployees);
    setRuns(runsPayload.payrollRuns ?? []);
    setAdjustments((current) => {
      const next = { ...current };
      for (const employee of nextEmployees) {
        next[employee.id] = next[employee.id] ?? { bonus: '', deduction: '', note: '' };
      }
      return next;
    });
  };

  useEffect(() => {
    void refresh().catch((error: Error) => setMessage(error.message));
  }, []);

  const saveEmployee = async () => {
    if (!employeeForm.fullName.trim() || !employeeForm.addressText.trim()) {
      setMessage('Employee name and address are required.');
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
          designation: employeeForm.designation || undefined,
          department: employeeForm.department || undefined,
          emergencyContactName: employeeForm.emergencyContactName || undefined,
          emergencyContactPhone: employeeForm.emergencyContactPhone || undefined,
          educationSummary: employeeForm.educationSummary || undefined,
          experienceSummary: employeeForm.experienceSummary || undefined,
          trainingSummary: employeeForm.trainingSummary || undefined,
          note: employeeForm.note || undefined,
        }),
      });
      await refresh();
      setEmployeeForm(defaultEmployeeForm);
      setMessage('Employee profile saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const payrollPreview = useMemo(() => employees.map((employee) => {
    const adjustment = adjustments[employee.id] ?? { bonus: '', deduction: '', note: '' };
    const gross = Number(employee.monthly_salary || 0);
    const bonus = Number(adjustment.bonus || 0);
    const deduction = Number(adjustment.deduction || 0);
    return {
      employeeId: employee.id,
      label: `${employee.full_name} (${employee.employee_number || 'Pending'})`,
      gross,
      bonus,
      deduction,
      net: gross + bonus - deduction,
      note: adjustment.note || undefined,
    };
  }), [adjustments, employees]);

  const previewTotals = useMemo(() => ({
    gross: payrollPreview.reduce((sum, item) => sum + item.gross, 0),
    bonus: payrollPreview.reduce((sum, item) => sum + item.bonus, 0),
    deduction: payrollPreview.reduce((sum, item) => sum + item.deduction, 0),
    net: payrollPreview.reduce((sum, item) => sum + item.net, 0),
  }), [payrollPreview]);

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
          items: payrollPreview.map((employee) => ({
            employeeId: employee.employeeId,
            grossAmount: employee.gross,
            bonusAmount: employee.bonus,
            deductionAmount: employee.deduction,
            note: employee.note,
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
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(420px, 1fr)', gap: 16 }}>
        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Employee Register</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <input value={employeeForm.fullName} onChange={(event) => setEmployeeForm((current) => ({ ...current, fullName: event.target.value }))} style={fieldStyle} placeholder="Full name*" />
            <input value={employeeForm.mobileNo} onChange={(event) => setEmployeeForm((current) => ({ ...current, mobileNo: event.target.value }))} style={fieldStyle} placeholder="Mobile" />
            <input value={employeeForm.email} onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))} style={fieldStyle} placeholder="Email" />
            <input value={employeeForm.addressText} onChange={(event) => setEmployeeForm((current) => ({ ...current, addressText: event.target.value }))} style={fieldStyle} placeholder="Address*" />
            <select value={employeeForm.roleCode} onChange={(event) => setEmployeeForm((current) => ({ ...current, roleCode: event.target.value }))} style={fieldStyle}>
              <option value="store_owner">Store Owner</option>
              <option value="store_manager">Manager</option>
              <option value="store_salesman">Salesman</option>
            </select>
            <input type="date" value={employeeForm.joinDate} onChange={(event) => setEmployeeForm((current) => ({ ...current, joinDate: event.target.value }))} style={fieldStyle} />
            <input value={employeeForm.employmentType} onChange={(event) => setEmployeeForm((current) => ({ ...current, employmentType: event.target.value }))} style={fieldStyle} placeholder="Employment type" />
            <input value={employeeForm.designation} onChange={(event) => setEmployeeForm((current) => ({ ...current, designation: event.target.value }))} style={fieldStyle} placeholder="Designation" />
            <input value={employeeForm.department} onChange={(event) => setEmployeeForm((current) => ({ ...current, department: event.target.value }))} style={fieldStyle} placeholder="Department" />
            <input value={employeeForm.monthlySalary} onChange={(event) => setEmployeeForm((current) => ({ ...current, monthlySalary: event.target.value }))} style={fieldStyle} placeholder="Monthly salary" />
            <input value={employeeForm.emergencyContactName} onChange={(event) => setEmployeeForm((current) => ({ ...current, emergencyContactName: event.target.value }))} style={fieldStyle} placeholder="Emergency contact name" />
            <input value={employeeForm.emergencyContactPhone} onChange={(event) => setEmployeeForm((current) => ({ ...current, emergencyContactPhone: event.target.value }))} style={fieldStyle} placeholder="Emergency contact phone" />
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <textarea value={employeeForm.educationSummary} onChange={(event) => setEmployeeForm((current) => ({ ...current, educationSummary: event.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Educational qualifications" />
            <textarea value={employeeForm.experienceSummary} onChange={(event) => setEmployeeForm((current) => ({ ...current, experienceSummary: event.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Experience summary" />
            <textarea value={employeeForm.trainingSummary} onChange={(event) => setEmployeeForm((current) => ({ ...current, trainingSummary: event.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Training and certifications" />
            <textarea value={employeeForm.note} onChange={(event) => setEmployeeForm((current) => ({ ...current, note: event.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Internal note" />
          </div>
          <button onClick={saveEmployee} style={{ ...secondaryButtonStyle, marginTop: 10 }} disabled={loading}>Save Employee</button>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Employees</h3>
          {employees.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Employee</th>
                    <th style={tableHeaderCellStyle}>Role</th>
                    <th style={tableHeaderCellStyle}>Designation</th>
                    <th style={tableHeaderCellStyle}>Contact</th>
                    <th style={tableHeaderCellStyle}>Salary</th>
                    <th style={tableHeaderCellStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td style={tableCellStyle}>
                        {employee.full_name}
                        <div style={{ color: '#64748b', marginTop: 4 }}>{employee.employee_number || 'Pending ID'}</div>
                      </td>
                      <td style={tableCellStyle}>{employee.role_code}</td>
                      <td style={tableCellStyle}>{employee.designation || '—'}</td>
                      <td style={tableCellStyle}>{employee.mobile_no || employee.email || '—'}</td>
                      <td style={tableCellStyle}>{employee.monthly_salary}</td>
                      <td style={tableCellStyle}>{employee.employment_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={emptyStateStyle}>No employees added yet.</div>}
        </article>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 0.85fr) minmax(460px, 1.15fr)', gap: 16 }}>
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
            <div style={{ color: '#64748b', fontSize: 13 }}>
              Gross: {previewTotals.gross.toFixed(2)} · Bonus: {previewTotals.bonus.toFixed(2)} · Deduction: {previewTotals.deduction.toFixed(2)} · Net: {previewTotals.net.toFixed(2)}
            </div>
            <button onClick={createRun} style={secondaryButtonStyle} disabled={loading}>Create Payroll Run</button>
          </div>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Payroll Draft Preview</h3>
          {payrollPreview.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderCellStyle}>Employee</th>
                    <th style={tableHeaderCellStyle}>Gross</th>
                    <th style={tableHeaderCellStyle}>Bonus</th>
                    <th style={tableHeaderCellStyle}>Deduction</th>
                    <th style={tableHeaderCellStyle}>Note</th>
                    <th style={tableHeaderCellStyle}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollPreview.map((employee) => (
                    <tr key={employee.employeeId}>
                      <td style={tableCellStyle}>{employee.label}</td>
                      <td style={tableCellStyle}>{employee.gross.toFixed(2)}</td>
                      <td style={tableCellStyle}>
                        <input value={adjustments[employee.employeeId]?.bonus || ''} onChange={(event) => setAdjustments((current) => ({ ...current, [employee.employeeId]: { ...(current[employee.employeeId] ?? { bonus: '', deduction: '', note: '' }), bonus: event.target.value } }))} style={fieldStyle} placeholder="Bonus" />
                      </td>
                      <td style={tableCellStyle}>
                        <input value={adjustments[employee.employeeId]?.deduction || ''} onChange={(event) => setAdjustments((current) => ({ ...current, [employee.employeeId]: { ...(current[employee.employeeId] ?? { bonus: '', deduction: '', note: '' }), deduction: event.target.value } }))} style={fieldStyle} placeholder="Deduction" />
                      </td>
                      <td style={tableCellStyle}>
                        <input value={adjustments[employee.employeeId]?.note || ''} onChange={(event) => setAdjustments((current) => ({ ...current, [employee.employeeId]: { ...(current[employee.employeeId] ?? { bonus: '', deduction: '', note: '' }), note: event.target.value } }))} style={fieldStyle} placeholder="Item note" />
                      </td>
                      <td style={tableCellStyle}>{employee.net.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={emptyStateStyle}>No employees available for payroll yet.</div>}
        </article>
      </section>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Payroll Runs</h3>
        {runs.length ? (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={tableHeaderCellStyle}>Run</th>
                  <th style={tableHeaderCellStyle}>Period</th>
                  <th style={tableHeaderCellStyle}>Employees</th>
                  <th style={tableHeaderCellStyle}>Bonus</th>
                  <th style={tableHeaderCellStyle}>Deduction</th>
                  <th style={tableHeaderCellStyle}>Total</th>
                  <th style={tableHeaderCellStyle}>Status</th>
                  <th style={tableHeaderCellStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td style={tableCellStyle}>{run.payroll_no || run.id}</td>
                    <td style={tableCellStyle}>{run.period_start} → {run.period_end}</td>
                    <td style={tableCellStyle}>{run.total_employees || run.item_count}</td>
                    <td style={tableCellStyle}>{run.total_bonus_amount || 0}</td>
                    <td style={tableCellStyle}>{run.total_deduction_amount || 0}</td>
                    <td style={tableCellStyle}>{run.total_amount}</td>
                    <td style={tableCellStyle}>{run.status}</td>
                    <td style={tableCellStyle}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => void updateRunStatus(run.id, 'approved')} style={secondaryButtonStyle} disabled={loading}>Approve</button>
                        <button onClick={() => void updateRunStatus(run.id, 'paid')} style={secondaryButtonStyle} disabled={loading}>Mark Paid</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={emptyStateStyle}>No payroll runs created yet.</div>}
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
