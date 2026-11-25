import { redirect } from 'next/navigation';

// Disputes are a tab inside Support now.
export default function StoreDisputesPage() {
  redirect('/support?tab=disputes');
}
