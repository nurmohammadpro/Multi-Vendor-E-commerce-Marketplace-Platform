import { redirect } from 'next/navigation';

// Exchange lives in the After-Sales workspace now.
export default function StoreExchangePage() {
  redirect('/after-sales?tab=exchange');
}
