// A4 white-label invoice template for the Wholesale plan.
// Renders a standalone printable HTML document from a receipt payload.
// Deliberately free of any platform branding — the shop is the brand.
var money = function (v) { return Number(v ?? 0).toFixed(2); };
var qty = function (v) {
  var n = Number(v ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
};
function esc(v) { return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }

var TERMS_LABEL = { paid: 'PAID', due: 'DUE', cod: 'CASH ON DELIVERY' };

export function renderInvoiceA4(receipt) {
  var store = receipt.store || {};
  var totals = receipt.totals || {};
  var customer = receipt.customer || {};
  var total = Number(totals.total || 0);
  var paid = Number(totals.paid || 0);
  var due = Number(totals.due || 0);
  var discount = Number(totals.discount || 0);
  var exchange = receipt.exchange || null;
  var exchangeAmount = exchange ? Number(exchange.amount || 0) : 0;
  var terms = receipt.paymentTerms || (due > 0 ? 'due' : 'paid');

  var grossSubtotal = (receipt.items || []).reduce(function (sum, item) {
    return sum + (item.isExchangeItem ? 0 : Number(item.lineTotal || 0));
  }, 0);

  var dateSource = receipt.saleDate || receipt.printedAt || new Date().toISOString();
  var dateStr = new Date(dateSource).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  var dueDateStr = receipt.dueDate
    ? new Date(receipt.dueDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

  var storeLines = [store.address, store.phone, store.email].filter(Boolean);
  var storeLinesHtml = storeLines.length
    ? storeLines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('')
    : '';

  var logoHtml = store.logoUrl
    ? '<img src="' + esc(store.logoUrl) + '" alt="logo" style="max-height:56px;max-width:180px;object-fit:contain">'
    : '';

  var customerLines = [
    customer.phone ? 'Phone: ' + esc(customer.phone) : '',
    customer.email ? 'Email: ' + esc(customer.email) : '',
    customer.address ? esc(customer.address) : '',
  ].filter(Boolean);
  var customerLinesHtml = customerLines.length
    ? customerLines.map(function (l) { return '<div class="cd">' + l + '</div>'; }).join('')
    : '';

  var customerHtml = customer.name
    ? '<div class="cl">Bill To</div>' +
      '<div class="cn">' + esc(customer.name) + '</div>' +
      (customer.shopName ? '<div class="cd">' + esc(customer.shopName) + '</div>' : '') +
      customerLinesHtml
    : '<div class="cl">Bill To</div><div class="cn">Walk-in Customer</div>';

  var itemRows = (receipt.items || []).map(function (item, idx) {
    var details = [];
    if (item.variantLabel) details.push(esc(item.variantLabel));
    if (item.skuCode) details.push(esc(item.skuCode));
    var detHtml = details.length ? '<div class="sku">' + details.join(' · ') + '</div>' : '';
    return '<tr>' +
      '<td class="nc">' + (idx + 1) + '</td>' +
      '<td class="ic"><span class="in">' + esc(item.name || 'Item') + '</span>' + detHtml + '</td>' +
      '<td class="uc">' + money(item.unitPrice) + '</td>' +
      '<td class="qc">' + qty(item.qty) + '</td>' +
      '<td class="tc">' + money(item.lineTotal) + '</td>' +
      '</tr>';
  }).join('');

  var css = [
    '*{margin:0;padding:0;box-sizing:border-box}',
    'body{font-family:"Segoe UI",system-ui,-apple-system,sans-serif;background:#fff;color:#1e293b;font-size:11px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.page{max-width:190mm;margin:0 auto;padding:10mm 10mm}',
    '.header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:12px;border-bottom:2px solid #0f172a}',
    '.brand{display:flex;gap:12px;align-items:center;min-width:0}',
    '.brand-txt{min-width:0}',
    '.sn{font-size:20px;font-weight:700;letter-spacing:-.01em;color:#0f172a;line-height:1.2}',
    '.sm{font-size:10px;color:#64748b;line-height:1.45;margin-top:2px}',
    '.doc{text-align:right;flex-shrink:0}',
    '.doc-t{font-size:22px;font-weight:700;letter-spacing:.18em;color:#0f172a;text-transform:uppercase;line-height:1}',
    '.doc-no{font-size:13px;font-weight:600;color:#334155;margin-top:4px;font-family:monospace;letter-spacing:.04em}',
    '.doc-d{font-size:10px;color:#64748b;margin-top:2px}',
    '.badge{display:inline-block;margin-top:8px;padding:3px 10px;border-radius:999px;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}',
    '.badge.paid{background:#dcfce7;color:#166534}',
    '.badge.due{background:#fef3c7;color:#92400e}',
    '.badge.cod{background:#dbeafe;color:#1e40af}',
    '.meta{display:flex;justify-content:space-between;gap:20px;margin-top:12px}',
    '.billto{min-width:0;flex:1}',
    '.termso{text-align:right;flex-shrink:0;max-width:45%}',
    '.cl{font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:600}',
    '.cn{font-size:12.5px;font-weight:600;color:#0f172a;margin-top:2px}',
    '.cd{font-size:10.5px;color:#475569;line-height:1.45}',
    '.tv{font-size:10.5px;color:#475569;margin-top:2px}',
    '.tv b{color:#0f172a;font-weight:600}',
    'table{width:100%;border-collapse:collapse;margin-top:12px}',
    'thead{display:table-header-group}',
    'tr{page-break-inside:avoid}',
    'th{background:#f8fafc;color:#475569;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;padding:5px 6px;border-bottom:1.5px solid #cbd5e1;text-align:left}',
    'td{padding:4.5px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top;line-height:1.4}',
    '.nc{width:22px;color:#94a3b8;text-align:center}',
    '.ic{min-width:0}',
    '.in{font-weight:500;color:#0f172a}',
    '.sku{font-size:8.5px;color:#94a3b8;margin-top:1px}',
    '.uc{text-align:right;font-family:monospace;font-size:10.5px;white-space:nowrap}',
    '.qc{text-align:center;font-family:monospace;font-size:10.5px;white-space:nowrap}',
    '.tc{text-align:right;font-family:monospace;font-size:10.5px;font-weight:600;white-space:nowrap}',
    '.bottom{display:flex;justify-content:space-between;gap:28px;margin-top:14px}',
    '.words{flex:1;max-width:55%;padding-top:8px}',
    '.iw{font-size:10px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:6px 10px;line-height:1.5}',
    '.totals{width:240px;flex-shrink:0}',
    '.tr{display:flex;justify-content:space-between;padding:3px 0;font-size:11px;border-bottom:1px dotted #e2e8f0}',
    '.tr .lb{color:#64748b}',
    '.tr .vl{font-family:monospace;font-weight:600;color:#0f172a}',
    '.tr.neg .vl{color:#b45309}',
    '.tr.gt{font-weight:700;border-top:1.5px solid #0f172a;border-bottom:2px solid #0f172a;padding:6px 0;margin-top:2px;font-size:12px}',
    '.tr.due-row .vl{color:#b45309;font-weight:700}',
    '.sigs{display:flex;justify-content:space-between;gap:60px;margin-top:36px}',
    '.sig{flex:1;text-align:center}',
    '.sig-l{border-top:1px solid #94a3b8;padding-top:5px;font-size:9.5px;color:#64748b;letter-spacing:.05em}',
    '.ft{text-align:center;margin-top:22px;padding-top:8px;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:9px}',
    '@media print{@page{margin:0;size:A4}.page{padding:11mm 10mm}}',
  ].join('\n');

  var termsBlock = ''
    + '<div class="cl">Payment Terms</div>'
    + '<div class="tv" style="margin-top:3px"><b>' + (TERMS_LABEL[terms] || esc(terms)) + '</b></div>'
    + (dueDateStr ? '<div class="tv">Due date: <b>' + dueDateStr + '</b></div>' : '')
    + '<div class="tv" style="margin-top:6px">Invoice date: <b>' + dateStr + '</b></div>';

  return '<!doctype html><html><head><meta charset="utf-8"><title>Invoice ' + esc(receipt.invoiceNo || receipt.saleNo || '') + '</title><style>' + css + '</style></head><body><div class="page">'
    + '<div class="header">'
    + '<div class="brand">' + logoHtml + '<div class="brand-txt"><div class="sn">' + esc(store.name || 'Store') + '</div>' + (storeLinesHtml ? '<div class="sm">' + storeLinesHtml + '</div>' : '') + '</div></div>'
    + '<div class="doc"><div class="doc-t">Invoice</div><div class="doc-no">' + esc(receipt.invoiceNo || receipt.saleNo || '—') + '</div><div class="badge ' + esc(terms) + '">' + (TERMS_LABEL[terms] || esc(terms)) + '</div></div>'
    + '</div>'
    + '<div class="meta">'
    + '<div class="billto">' + customerHtml + '</div>'
    + '<div class="termso">' + termsBlock + '</div>'
    + '</div>'
    + '<table><thead><tr><th class="nc">#</th><th class="ic">Item</th><th class="uc" style="text-align:right">Unit Price</th><th class="qc" style="text-align:center">Qty</th><th class="tc" style="text-align:right">Total</th></tr></thead><tbody>' + itemRows + '</tbody></table>'
    + '<div class="bottom">'
    + '<div class="words">' + (receipt.amountInWords ? '<div class="iw"><span style="text-transform:uppercase;font-size:9px;letter-spacing:.07em;color:#94a3b8">Amount in words</span><br>' + esc(receipt.amountInWords) + '</div>' : '') + '</div>'
    + '<div class="totals">'
    + '<div class="tr"><span class="lb">Sub Total</span><span class="vl">' + money(grossSubtotal) + '</span></div>'
    + (exchangeAmount > 0 ? '<div class="tr neg"><span class="lb">Exchange</span><span class="vl">-' + money(exchangeAmount) + '</span></div>' : '')
    + (discount > 0 ? '<div class="tr neg"><span class="lb">Discount</span><span class="vl">-' + money(discount) + '</span></div>' : '')
    + (Number(totals.vat || 0) > 0 ? '<div class="tr"><span class="lb">VAT</span><span class="vl">' + money(totals.vat) + '</span></div>' : '')
    + (Number(totals.tax || 0) > 0 ? '<div class="tr"><span class="lb">Tax</span><span class="vl">' + money(totals.tax) + '</span></div>' : '')
    + (Number(totals.shipping || 0) > 0 ? '<div class="tr"><span class="lb">Shipping</span><span class="vl">' + money(totals.shipping) + '</span></div>' : '')
    + '<div class="tr gt"><span>Net Payable</span><span class="vl">' + money(total) + '</span></div>'
    + '<div class="tr"><span class="lb">Customer Paid</span><span class="vl">' + money(paid) + '</span></div>'
    + (due > 0 ? '<div class="tr due-row"><span class="lb">Due</span><span class="vl">' + money(due) + '</span></div>' : '')
    + '</div>'
    + '</div>'
    + '<div class="sigs"><div class="sig"><div class="sig-l">Received By</div></div><div class="sig"><div class="sig-l">Authorized Signature</div></div></div>'
    + (store.footer ? '<div class="ft">' + esc(store.footer) + '</div>' : '')
    + '</div></body></html>';
}
