import { redirect } from 'next/navigation';

// Daily expenses are a tab inside Finance now.
export default function StoreExpensesPage() {
  redirect('/finance?tab=expenses');
}
