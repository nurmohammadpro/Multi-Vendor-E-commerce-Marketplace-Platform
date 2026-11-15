import { redirect } from 'next/navigation';

// Hardware setup is a tab inside Settings now.
export default function HardwarePage() {
  redirect('/settings?tab=hardware');
}
