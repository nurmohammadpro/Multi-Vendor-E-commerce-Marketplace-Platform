import { redirect } from 'next/navigation';

// The activity log is a tab inside Reports now.
export default function StoreActivityPage() {
  redirect('/reports?tab=activity');
}
