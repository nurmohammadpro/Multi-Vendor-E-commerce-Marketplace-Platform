import { redirect } from 'next/navigation';

// Invoices live in the Sales (Records) workspace now.
export default function StoreInvoicesPage() {
  redirect('/sales?tab=invoices');
}
