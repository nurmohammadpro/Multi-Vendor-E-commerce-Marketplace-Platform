import { redirect } from 'next/navigation';

// Stock ledger is a tab inside Inventory now.
export default function StockLedgerPage() {
  redirect('/inventory?tab=ledger');
}
