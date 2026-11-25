import { redirect } from 'next/navigation';

// Approvals are a tab inside Inventory now.
export default function StoreApprovalsPage() {
  redirect('/inventory?tab=approvals');
}
