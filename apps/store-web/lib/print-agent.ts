export const DEFAULT_PRINT_AGENT_URL =
  process.env.NEXT_PUBLIC_PRINT_AGENT_URL || 'http://127.0.0.1:17658';

export type PrintAgentHealth = {
  ok: boolean;
  service?: string;
  port?: number;
  platform?: string;
  printerName?: string | null;
  labelPrinterName?: string | null;
};

export type ReceiptPayload = {
  saleId?: string | null;
  saleNo?: string | null;
  store?: {
    name?: string | null;
    phone?: string | null;
    footer?: string | null;
  };
  customer?: {
    name?: string | null;
    phone?: string | null;
  };
  items?: Array<{
    name?: string | null;
    skuCode?: string | null;
    qty?: number;
    unitPrice?: number;
    lineTotal?: number;
  }>;
  totals?: {
    subtotal?: number;
    discount?: number;
    tax?: number;
    shipping?: number;
    total?: number;
    paid?: number;
    change?: number;
  };
  payments?: Array<{
    paymentMethod?: string | null;
    amount?: number;
  }>;
  printedAt?: string | null;
};

const money = (value: number | undefined | null) => Number(value ?? 0).toFixed(2);

export async function fetchPrintAgentHealth(baseUrl = DEFAULT_PRINT_AGENT_URL) {
  const response = await fetch(`${baseUrl}/health`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Print agent health failed with ${response.status}`);
  }
  return (await response.json()) as PrintAgentHealth;
}

export function formatReceiptText(receipt: ReceiptPayload) {
  const lines = [
    receipt.store?.name || 'Store',
    receipt.saleNo ? `Receipt: ${receipt.saleNo}` : 'Receipt',
    receipt.printedAt ? `Printed: ${new Date(receipt.printedAt).toLocaleString()}` : null,
    receipt.customer?.name ? `Customer: ${receipt.customer.name}` : null,
    receipt.customer?.phone ? `Phone: ${receipt.customer.phone}` : null,
    '------------------------------',
    ...(receipt.items ?? []).flatMap((item) => [
      item.name || 'Item',
      `${item.qty ?? 0} x ${money(item.unitPrice)} = ${money(item.lineTotal)}`,
      item.skuCode ? `SKU: ${item.skuCode}` : null,
    ]),
    '------------------------------',
    `Subtotal: ${money(receipt.totals?.subtotal)}`,
    `Discount: ${money(receipt.totals?.discount)}`,
    `Tax: ${money(receipt.totals?.tax)}`,
    `Shipping: ${money(receipt.totals?.shipping)}`,
    `Total: ${money(receipt.totals?.total)}`,
    `Paid: ${money(receipt.totals?.paid)}`,
    `Change: ${money(receipt.totals?.change)}`,
    ...(receipt.payments?.length
      ? [
          '------------------------------',
          ...receipt.payments.map(
            (payment) => `${payment.paymentMethod || 'payment'}: ${money(payment.amount)}`,
          ),
        ]
      : []),
    receipt.store?.footer || 'Thank you',
  ];

  return lines.filter(Boolean).join('\n');
}

export async function printReceipt(receipt: ReceiptPayload, printerName?: string) {
  const response = await fetch(`${DEFAULT_PRINT_AGENT_URL}/print/receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      printerName,
      text: formatReceiptText(receipt),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Receipt print failed with ${response.status}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

export async function printLabel(payload: {
  text: string;
  printerName?: string;
}) {
  const response = await fetch(`${DEFAULT_PRINT_AGENT_URL}/print/label`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error || `Label print failed with ${response.status}`);
  }

  return response.json().catch(() => ({ ok: true }));
}
