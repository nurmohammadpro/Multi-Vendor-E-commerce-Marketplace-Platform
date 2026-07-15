import { redirect } from 'next/navigation';

export default async function StorePayrollPage() {
  redirect('/staff?tab=payroll');
}
