import { redirect } from 'next/navigation';

// Shipping lives in the After-Sales workspace now.
export default function StoreShippingPage() {
  redirect('/after-sales?tab=shipments');
}
