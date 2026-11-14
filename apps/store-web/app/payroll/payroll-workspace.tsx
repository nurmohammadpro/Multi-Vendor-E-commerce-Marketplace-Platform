'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

import {
  emptyStateStyle,
  fieldStyle,
  pageShellStyle,
  searchButtonStyle,
  sectionPanelStyle,
  surfaceCardStyle,
  tableCellStyle,
  tableHeaderCellStyle,
  tableStyle,
  tableWrapStyle,
  tokenMutedStyle,
} from '../merchflow-theme';
import { ListPager, type PaginationState, totalPagesFor } from '../list-pager';

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
  if (!response.ok) throw new Error(payload && typeof payload === 'object' && ((payload as any).error || (payload as any).message) ? ((payload as any).error || (payload as any).message) : `Request failed with ${response.status}`);
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

export function PayrollWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [message, setMessage] = useState('Payroll workflow is ready.');
  const [loading, setLoading] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
  const isPro = subscriptionPlan === 'pro';
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [runSearch, setRunSearch] = useState('');
  const [employeePage, setEmployeePage] = useState(1);
  const [runPage, setRunPage] = useState(1);
  const [employeePagination, setEmployeePagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [runPagination, setRunPagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0 });
  const [employeeForm, setEmployeeForm] = useState(defaultEmployeeForm);
  const [runForm, setRunForm] = useState({
    periodStart: new Date().toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    status: 'draft',
    note: '',
  });
  const [adjustments, setAdjustments] = useState<Record<string, { bonus: string; deduction: string; note: string }>>({});

  // ── Summary state ──
  const [summary, setSummary] = useState<{
    totalEmployees: number;
    currentMonthPaid: number;
    currentMonthDraftCount: number;
    currentMonthApprovedCount: number;
    currentMonthTotal: number;
  } | null>(null);

  const currentMonthLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }, []);

  const fetchSummary = async () => {
    try {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const [employeesPayload, runsPayload] = await Promise.all([
        readJson<{ employees: Employee[]; pagination?: PaginationState }>(`/api/store-ops/payroll/employees?limit=1`),
        readJson<{ payrollRuns: PayrollRun[] }>(`/api/store-ops/payroll/runs?startDate=${monthStart}&endDate=${monthEnd}&limit=5000`),
      ]);

      const monthRuns = runsPayload.payrollRuns ?? [];
      setSummary({
        totalEmployees: employeesPayload.pagination?.total ?? 0,
        currentMonthPaid: monthRuns.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.total_amount), 0),
        currentMonthDraftCount: monthRuns.filter((r) => r.status === 'draft').length,
        currentMonthApprovedCount: monthRuns.filter((r) => r.status === 'approved').length,
        currentMonthTotal: monthRuns.reduce((s, r) => s + Number(r.total_amount), 0),
      });
    } catch { /* summary is non-critical */ }
  };

  // ── Export state ──
  const [exportMode, setExportMode] = useState<'monthly' | 'daterange'>('monthly');
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [exportStartDate, setExportStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);

  const refresh = async (nextEmployeePage = employeePage, nextRunPage = runPage) => {
    const employeeParams = new URLSearchParams({ page: String(nextEmployeePage), limit: String(employeePagination.limit) });
    const runParams = new URLSearchParams({ page: String(nextRunPage), limit: String(runPagination.limit) });
    if (employeeSearch.trim()) employeeParams.set('search', employeeSearch.trim());
    if (runSearch.trim()) runParams.set('search', runSearch.trim());
    const [employeesPayload, runsPayload] = await Promise.all([
      readJson<{ employees: Employee[]; pagination?: PaginationState }>(`/api/store-ops/payroll/employees?${employeeParams.toString()}`),
      readJson<{ payrollRuns: PayrollRun[]; pagination?: PaginationState }>(`/api/store-ops/payroll/runs?${runParams.toString()}`),
    ]);
    const nextEmployees = employeesPayload.employees ?? [];
    setEmployees(nextEmployees);
    setRuns(runsPayload.payrollRuns ?? []);
    setEmployeePagination(employeesPayload.pagination ?? { page: nextEmployeePage, limit: employeePagination.limit, total: nextEmployees.length });
    setRunPagination(runsPayload.pagination ?? { page: nextRunPage, limit: runPagination.limit, total: runsPayload.payrollRuns?.length ?? 0 });
    setEmployeePage(employeesPayload.pagination?.page ?? nextEmployeePage);
    setRunPage(runsPayload.pagination?.page ?? nextRunPage);
    setAdjustments((current) => {
      const next = { ...current };
      for (const employee of nextEmployees) {
        next[employee.id] = next[employee.id] ?? { bonus: '', deduction: '', note: '' };
      }
      return next;
    });
  };

  useEffect(() => {
    void Promise.all([
      refresh(1, 1),
      fetchSummary(),
      readJson<{ subscription?: { plan_code: string } }>('/api/billing/subscription').then((data) => setSubscriptionPlan(data.subscription?.plan_code ?? null)).catch(() => {}),
    ]).catch((error: Error) => setMessage(error.message));
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
      await refresh(1, runPage);
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
      await refresh(employeePage, 1);
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
      await refresh(employeePage, runPage);
      setMessage(`Payroll run marked ${status}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const statusBadgeStyle = (status: string): CSSProperties => {
    const colors: Record<string, { bg: string; text: string }> = {
      draft: { bg: '#fef3c7', text: '#92400e' },
      approved: { bg: '#dbeafe', text: '#1e40af' },
      paid: { bg: '#d1fae5', text: '#065f46' },
    };
    const c = colors[status] ?? { bg: 'var(--muted)', text: 'var(--foreground)' };
    return {
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      background: c.bg,
      color: c.text,
      textTransform: 'capitalize' as const,
    };
  };

  const exportDateRange = useMemo(() => {
    if (exportMode === 'monthly') {
      const start = `${exportMonth}-01`;
      const lastDay = new Date(Number(exportMonth.slice(0, 4)), Number(exportMonth.slice(5, 7)), 0).getDate();
      return { startDate: start, endDate: `${exportMonth}-${String(lastDay).padStart(2, '0')}` };
    }
    return { startDate: exportStartDate, endDate: exportEndDate };
  }, [exportMode, exportMonth, exportStartDate, exportEndDate]);

  const fetchPayrollExportData = async () => {
    const { startDate, endDate } = exportDateRange;
    const params = new URLSearchParams({ startDate, endDate, limit: '5000' });
    const payload = await readJson<{ payrollRuns: PayrollRun[] }>(`/api/store-ops/payroll/runs?${params.toString()}`);
    return payload.payrollRuns ?? [];
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const data = await fetchPayrollExportData();
      if (!data.length) { setMessage('No payroll runs found for this period.'); return; }

      const rows = data.map((r) => [
        r.payroll_no || r.id,
        r.period_start,
        r.period_end,
        String(r.total_employees || r.item_count),
        Number(r.total_bonus_amount || 0).toFixed(2),
        Number(r.total_deduction_amount || 0).toFixed(2),
        Number(r.total_amount).toFixed(2),
        r.status,
      ]);
      const csv = [
        '﻿Run,Period Start,Period End,Employees,Bonus,Deduction,Total,Status',
        ...rows.map((r) => r.join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const { startDate, endDate } = exportDateRange;
      a.download = `payroll-${startDate}_to_${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${data.length} payroll run(s) as CSV.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      const data = await fetchPayrollExportData();
      if (!data.length) { setMessage('No payroll runs found for this period.'); return; }

      const { startDate, endDate } = exportDateRange;
      const totalGross = data.reduce((s, r) => s + Number(r.total_amount), 0);
      const totalBonus = data.reduce((s, r) => s + Number(r.total_bonus_amount || 0), 0);
      const totalDeduction = data.reduce((s, r) => s + Number(r.total_deduction_amount || 0), 0);

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(16);
      doc.text('Payroll Report', pageWidth / 2, 16, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`Period: ${startDate} to ${endDate}`, pageWidth / 2, 23, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleDateString('en-BD', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, 29, { align: 'center' });

      const tableData = data.map((r) => [
        r.payroll_no || r.id,
        r.period_start,
        r.period_end,
        String(r.total_employees || r.item_count),
        Number(r.total_bonus_amount || 0).toFixed(2),
        Number(r.total_deduction_amount || 0).toFixed(2),
        Number(r.total_amount).toFixed(2),
        r.status,
      ]);

      (doc as any).autoTable({
        startY: 34,
        head: [['Run', 'Period Start', 'Period End', 'Emp', 'Bonus', 'Deduction', 'Total', 'Status']],
        body: tableData,
        foot: [['', '', '', '', totalBonus.toFixed(2), totalDeduction.toFixed(2), totalGross.toFixed(2), '']],
        theme: 'grid',
        headStyles: { fillColor: [41, 41, 41], textColor: 255, fontSize: 7, fontStyle: 'bold' },
        footStyles: { fillColor: [245, 245, 245], textColor: [41, 41, 41], fontSize: 7, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [252, 252, 252] },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 22 },
          2: { cellWidth: 22 },
          3: { cellWidth: 12 },
          4: { cellWidth: 20, halign: 'right' },
          5: { cellWidth: 20, halign: 'right' },
          6: { cellWidth: 22, halign: 'right' },
          7: { cellWidth: 16 },
        },
        margin: { left: 8, right: 8 },
      });

      doc.save(`payroll-${startDate}_to_${endDate}.pdf`);
      setMessage(`Exported ${data.length} payroll run(s) as PDF.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const totalEmployeePages = totalPagesFor(employeePagination);
  const totalRunPages = totalPagesFor(runPagination);

  return (
    <section style={embedded ? { display: 'grid', gap: 10 } : { ...pageShellStyle, display: 'grid', gap: 10 }}>
      {/* ── Payroll Summary Card ── */}
      {summary ? (
        <article style={{ ...surfaceCardStyle, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Payroll Summary — {currentMonthLabel}</h3>
            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
              Total this period: <strong style={{ color: 'var(--foreground)' }}>BDT {summary.currentMonthTotal.toFixed(2)}</strong>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div style={{ background: '#d1fae5', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#065f46' }}>BDT {summary.currentMonthPaid.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: '#065f46', marginTop: 2 }}>Paid Out</div>
            </div>
            <div style={{ background: '#fef3c7', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#92400e' }}>{summary.currentMonthDraftCount}</div>
              <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>Pending Approval</div>
            </div>
            <div style={{ background: '#dbeafe', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1e40af' }}>{summary.currentMonthApprovedCount}</div>
              <div style={{ fontSize: 12, color: '#1e40af', marginTop: 2 }}>Approved Unpaid</div>
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)' }}>{summary.totalEmployees}</div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>Employees on File</div>
            </div>
          </div>
        </article>
      ) : null}

      <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'minmax(340px, 1fr) minmax(420px, 1fr)' }}>
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
            {isPro ? <input value={employeeForm.designation} onChange={(event) => setEmployeeForm((current) => ({ ...current, designation: event.target.value }))} style={fieldStyle} placeholder="Designation" /> : null}
            {isPro ? <input value={employeeForm.department} onChange={(event) => setEmployeeForm((current) => ({ ...current, department: event.target.value }))} style={fieldStyle} placeholder="Department" /> : null}
            {isPro ? <input value={employeeForm.monthlySalary} onChange={(event) => setEmployeeForm((current) => ({ ...current, monthlySalary: event.target.value }))} style={fieldStyle} placeholder="Monthly salary" /> : null}
            {isPro ? <input value={employeeForm.emergencyContactName} onChange={(event) => setEmployeeForm((current) => ({ ...current, emergencyContactName: event.target.value }))} style={fieldStyle} placeholder="Emergency contact name" /> : null}
            <input value={employeeForm.emergencyContactPhone} onChange={(event) => setEmployeeForm((current) => ({ ...current, emergencyContactPhone: event.target.value }))} style={fieldStyle} placeholder="Emergency contact phone" />
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <textarea value={employeeForm.educationSummary} onChange={(event) => setEmployeeForm((current) => ({ ...current, educationSummary: event.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Educational qualifications" />
            <textarea value={employeeForm.experienceSummary} onChange={(event) => setEmployeeForm((current) => ({ ...current, experienceSummary: event.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Experience summary" />
            <textarea value={employeeForm.trainingSummary} onChange={(event) => setEmployeeForm((current) => ({ ...current, trainingSummary: event.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Training and certifications" />
            <textarea value={employeeForm.note} onChange={(event) => setEmployeeForm((current) => ({ ...current, note: event.target.value }))} style={{ ...fieldStyle, minHeight: 74 }} placeholder="Internal note" />
          </div>
          <button onClick={saveEmployee} style={{ ...searchButtonStyle, marginTop: 10 }} disabled={loading}>Save Employee</button>
        </article>

        <article style={surfaceCardStyle}>
          <h3 style={{ marginTop: 0 }}>Employees</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, marginBottom: 12 }}>
            <input value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} style={fieldStyle} placeholder="Search employee, mobile, email, role" />
            <button onClick={() => void refresh(1, runPage)} style={searchButtonStyle} disabled={loading}>Search</button>
          </div>
          {employees.length ? (
            <>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={tableHeaderCellStyle}>Employee</th>
                      <th style={tableHeaderCellStyle}>Role</th>
                      {isPro ? <th style={tableHeaderCellStyle}>Designation</th> : null}
                      <th style={tableHeaderCellStyle}>Contact</th>
                      {isPro ? <th style={tableHeaderCellStyle}>Salary</th> : null}
                      <th style={tableHeaderCellStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) => (
                      <tr key={employee.id}>
                        <td style={tableCellStyle}>
                          {employee.full_name}
                          <div style={{ color: 'var(--muted-foreground)', marginTop: 4 }}>{employee.employee_number || 'Pending ID'}</div>
                        </td>
                        <td style={tableCellStyle}>{employee.role_code}</td>
                        {isPro ? <td style={tableCellStyle}>{employee.designation || '—'}</td> : null}
                        <td style={tableCellStyle}>{employee.mobile_no || employee.email || '—'}</td>
                        {isPro ? <td style={tableCellStyle}>{employee.monthly_salary}</td> : null}
                        <td style={tableCellStyle}>{employee.employment_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ListPager
                loading={loading}
                page={employeePage}
                pagination={employeePagination}
                label="employee(s)"
                onPrevious={() => void refresh(Math.max(1, employeePage - 1), runPage)}
                onNext={() => void refresh(Math.min(totalEmployeePages, employeePage + 1), runPage)}
              />
            </>
          ) : <div style={emptyStateStyle}>No employees added yet.</div>}
        </article>
      </section>

      <section style={{ ...sectionPanelStyle, gridTemplateColumns: 'minmax(320px, 0.85fr) minmax(460px, 1.15fr)' }}>
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
            <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
              Gross: {previewTotals.gross.toFixed(2)} · Bonus: {previewTotals.bonus.toFixed(2)} · Deduction: {previewTotals.deduction.toFixed(2)} · Net: {previewTotals.net.toFixed(2)}
            </div>
            <button onClick={createRun} style={searchButtonStyle} disabled={loading}>Create Payroll Run</button>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, marginBottom: 12 }}>
          <input value={runSearch} onChange={(event) => setRunSearch(event.target.value)} style={fieldStyle} placeholder="Search payroll no or status" />
          <button onClick={() => void refresh(employeePage, 1)} style={searchButtonStyle} disabled={loading}>Search</button>
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
          <button onClick={() => void exportCSV()} style={{ ...searchButtonStyle, fontSize: 12 }} disabled={exporting}>CSV</button>
          <button onClick={() => void exportPDF()} style={{ ...searchButtonStyle, fontSize: 12 }} disabled={exporting}>PDF</button>
        </div>

        {runs.length ? (
          <>
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
                      <td style={tableCellStyle}><span style={statusBadgeStyle(run.status)}>{run.status}</span></td>
                      <td style={tableCellStyle}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {run.status === 'draft' ? (
                            <button onClick={() => void updateRunStatus(run.id, 'approved')} style={searchButtonStyle} disabled={loading}>Approve</button>
                          ) : null}
                          {run.status === 'approved' ? (
                            <button onClick={() => void updateRunStatus(run.id, 'paid')} style={{ ...searchButtonStyle, background: '#059669', borderColor: '#059669', color: '#fff' }} disabled={loading}>Mark Paid</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPager
              loading={loading}
              page={runPage}
              pagination={runPagination}
              label="run(s)"
              onPrevious={() => void refresh(employeePage, Math.max(1, runPage - 1))}
              onNext={() => void refresh(employeePage, Math.min(totalRunPages, runPage + 1))}
            />
          </>
        ) : <div style={emptyStateStyle}>No payroll runs created yet.</div>}
      </article>

      <article style={surfaceCardStyle}>
        <h3 style={{ marginTop: 0 }}>Operator Notes</h3>
        <p style={tokenMutedStyle}>{message}</p>
      </article>
    </section>
  );
}
