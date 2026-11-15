import { redirect } from 'next/navigation';

// Banking is a tab inside Finance now.
export default function StoreBankingPage() {
  redirect('/finance?tab=banking');
}
