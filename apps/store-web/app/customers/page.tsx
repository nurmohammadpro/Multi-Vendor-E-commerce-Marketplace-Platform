import { redirect } from 'next/navigation';

// Customers live in the Customers & Dues (receivables) workspace now.
export default function StoreCustomersPage() {
  redirect('/receivables?tab=customers');
}
