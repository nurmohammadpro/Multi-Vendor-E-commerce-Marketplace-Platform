import { redirect } from 'next/navigation';

// Sales history lives in the Sales (Records) workspace now.
export default function StoreSalesHistoryPage() {
  redirect('/sales?tab=history');
}
