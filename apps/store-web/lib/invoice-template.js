// White-label print document template (A4 invoice / A5 sales receipt).
// One dense design, size-tuned per paper format; free of platform branding.
// `renderInvoice(receipt, 'a4')` for the wholesale A4 invoice,
// `renderInvoice(receipt, 'a5')` for the A5 laser receipt.
var money = function (v) { return Number(v ?? 0).toFixed(2); };
var qty = function (v) {
  var n = Number(v ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
};
function esc(v) { return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('\n', '<br>'); }

var TERMS_LABEL = { paid: 'PAID', due: 'DUE', cod: 'CASH ON DELIVERY' };

export function renderInvoice(receipt, mode) {
  var isA5 = mode === 'a5';
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
  var docTitle = receipt.docTitle || (receipt.invoiceNo ? 'Invoice' : 'Sales Receipt');

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
    ? '<img src="' + esc(store.logoUrl) + '" alt="logo" style="max-height:' + (isA5 ? '34px' : '44px') + ';max-width:' + (isA5 ? '130px' : '160px') + ';object-fit:contain">'
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
    ? '<div class="cl">' + (isA5 ? 'Customer' : 'Bill To') + '</div>' +
      '<div class="cn">' + esc(customer.name) + '</div>' +
      (customer.shopName ? '<div class="cd">' + esc(customer.shopName) + '</div>' : '') +
      customerLinesHtml
    : '<div class="cl">' + (isA5 ? 'Customer' : 'Bill To') + '</div><div class="cn">Walk-in Customer</div>';

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

  // Size-tuned tokens: A5 trades the A4's generous rhythm for compactness.
  var s = isA5 ? {
    page: 'max-width:140mm;margin:0 auto;padding:8mm 7mm',
    body: 'font-size:10px;line-height:1.35',
    sn: 'font-size:16px', sm: 'font-size:9px;line-height:1.35',
    logoBox: '', docT: 'font-size:18px', docNo: 'font-size:11px;margin-top:3px',
    badge: 'margin-top:5px;padding:2px 8px;font-size:8px',
    meta: 'margin-top:8px', cl: 'font-size:8px', cn: 'font-size:11.5px;margin-top:1px',
    cd: 'font-size:9.5px;line-height:1.35', tv: 'font-size:9.5px',
    table: 'margin-top:6px', th: 'font-size:8px;padding:3px 4px;border-bottom:1px solid #cbd5e1',
    td: 'padding:2.5px 4px;line-height:1.25', nc: 'width:16px',
    sku: 'font-size:7.5px', num: 'font-size:9.5px',
    bottom: 'margin-top:8px', words: 'padding-top:5px',
    iw: 'font-size:9px;padding:5px 8px;line-height:1.4',
    totals: 'width:200px', tr: 'padding:2px 0;font-size:10px',
    gt: 'padding:4px 0;font-size:11px;border-top:1px solid #0f172a;border-bottom:1.5px solid #0f172a',
    sigs: 'margin-top:20px', sigL: 'padding-top:4px;font-size:8.5px',
    ft: 'margin-top:10px;padding-top:5px;font-size:8px',
    print: '@media print{@page{margin:0;size:A5}.page{padding:9mm 7mm}}',
  } : {
    page: 'max-width:192mm;margin:0 auto;padding:8mm 8mm',
    body: 'font-size:10.5px;line-height:1.35',
    sn: 'font-size:18px', sm: 'font-size:9.5px;line-height:1.35',
    logoBox: '', docT: 'font-size:20px', docNo: 'font-size:12px;margin-top:3px',
    badge: 'margin-top:6px;padding:2px 9px;font-size:8.5px',
    meta: 'margin-top:9px', cl: 'font-size:8px', cn: 'font-size:12px;margin-top:1px',
    cd: 'font-size:10px;line-height:1.35', tv: 'font-size:10px',
    table: 'margin-top:8px', th: 'font-size:8.5px;padding:3.5px 5px;border-bottom:1px solid #cbd5e1',
    td: 'padding:3px 5px;line-height:1.3', nc: 'width:18px',
    sku: 'font-size:8px', num: 'font-size:10px',
    bottom: 'margin-top:10px', words: 'padding-top:6px',
    iw: 'font-size:9.5px;padding:5px 8px;line-height:1.45',
    totals: 'width:230px', tr: 'padding:2.5px 0;font-size:10.5px',
    gt: 'padding:5px 0;font-size:11.5px;border-top:1px solid #0f172a;border-bottom:1.5px solid #0f172a',
    sigs: 'margin-top:26px', sigL: 'padding-top:4px;font-size:9px',
    ft: 'margin-top:14px;padding-top:6px;font-size:8.5px',
    print: '@media print{@page{margin:0;size:A4}.page{padding:9mm 8mm}}',
  };

  var css = [
    '*{margin:0;padding:0;box-sizing:border-box}',
    'body{font-family:"Segoe UI",system-ui,-apple-system,sans-serif;background:#fff;color:#1e293b;' + s.body + ';-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.page{' + s.page + '}',
    '.header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-bottom:9px;border-bottom:1.5px solid #0f172a}',
    '.brand{display:flex;gap:10px;align-items:center;min-width:0}',
    '.brand-txt{min-width:0}',
    '.sn{font-weight:700;letter-spacing:-.01em;color:#0f172a;line-height:1.15;' + s.sn + '}',
    '.sm{color:#64748b;margin-top:1px;' + s.sm + '}',
    '.doc{text-align:right;flex-shrink:0}',
    '.doc-t{font-weight:700;letter-spacing:.18em;color:#0f172a;text-transform:uppercase;line-height:1;' + s.docT + '}',
    '.doc-no{font-weight:600;color:#334155;font-family:monospace;letter-spacing:.04em;' + s.docNo + '}',
    '.badge{display:inline-block;border-radius:999px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;' + s.badge + '}',
    '.badge.paid{background:#dcfce7;color:#166534}',
    '.badge.due{background:#fef3c7;color:#92400e}',
    '.badge.cod{background:#dbeafe;color:#1e40af}',
    '.meta{display:flex;justify-content:space-between;gap:16px;' + s.meta + '}',
    '.billto{min-width:0;flex:1}',
    '.termso{text-align:right;flex-shrink:0;max-width:45%}',
    '.cl{text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:600;' + s.cl + '}',
    '.cn{font-weight:600;color:#0f172a;' + s.cn + '}',
    '.cd{color:#475569;' + s.cd + '}',
    '.tv{color:#475569;margin-top:1px;' + s.tv + '}',
    '.tv b{color:#0f172a;font-weight:600}',
    'table{width:100%;border-collapse:collapse;' + s.table + '}',
    'thead{display:table-header-group}',
    'tr{page-break-inside:avoid}',
    'th{background:#f8fafc;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.06em;text-align:left;border-bottom:1px solid #cbd5e1;' + s.th + '}',
    'td{border-bottom:1px solid #e2e8f0;vertical-align:top;' + s.td + '}',
    '.nc{color:#94a3b8;text-align:center;' + s.nc + '}',
    '.ic{min-width:0}',
    '.in{font-weight:500;color:#0f172a}',
    '.sku{color:#94a3b8;margin-top:0;' + s.sku + '}',
    '.uc{text-align:right;font-family:monospace;white-space:nowrap;' + s.num + '}',
    '.qc{text-align:center;font-family:monospace;white-space:nowrap;' + s.num + '}',
    '.tc{text-align:right;font-family:monospace;font-weight:600;white-space:nowrap;' + s.num + '}',
    '.bottom{display:flex;justify-content:space-between;gap:24px;' + s.bottom + '}',
    '.words{flex:1;max-width:55%;' + s.words + '}',
    '.iw{color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;' + s.iw + '}',
    '.totals{flex-shrink:0;' + s.totals + '}',
    '.tr{display:flex;justify-content:space-between;border-bottom:1px dotted #e2e8f0;' + s.tr + '}',
    '.tr .lb{color:#64748b}',
    '.tr .vl{font-family:monospace;font-weight:600;color:#0f172a}',
    '.tr.neg .vl{color:#b45309}',
    '.tr.gt{font-weight:700;' + s.gt + '}',
    '.tr.due-row .vl{color:#b45309;font-weight:700}',
    '.sigs{display:flex;justify-content:space-between;gap:40px;' + s.sigs + '}',
    '.sig{flex:1;text-align:center}',
    '.sig-l{border-top:1px solid #94a3b8;color:#64748b;letter-spacing:.05em;' + s.sigL + '}',
    '.ft{text-align:center;border-top:1px solid #f1f5f9;color:#94a3b8;' + s.ft + '}',
    s.print,
  ].join('\n');

  var termsBlock = ''
    + '<div class="cl">Payment Terms</div>'
    + '<div class="tv" style="margin-top:2px"><b>' + (TERMS_LABEL[terms] || esc(terms)) + '</b></div>'
    + (dueDateStr ? '<div class="tv">Due date: <b>' + dueDateStr + '</b></div>' : '')
    + '<div class="tv">Document date: <b>' + dateStr + '</b></div>';

  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(docTitle) + ' ' + esc(receipt.invoiceNo || receipt.saleNo || '') + '</title><style>' + css + '</style></head><body><div class="page">'
    + '<div class="header">'
    + '<div class="brand">' + logoHtml + '<div class="brand-txt"><div class="sn">' + esc(store.name || 'Store') + '</div>' + (storeLinesHtml ? '<div class="sm">' + storeLinesHtml + '</div>' : '') + '</div></div>'
    + '<div class="doc"><div class="doc-t">' + esc(docTitle) + '</div><div class="doc-no">' + esc(receipt.invoiceNo || receipt.saleNo || '—') + '</div><div class="badge ' + esc(terms) + '">' + (TERMS_LABEL[terms] || esc(terms)) + '</div></div>'
    + '</div>'
    + '<div class="meta">'
    + '<div class="billto">' + customerHtml + '</div>'
    + '<div class="termso">' + termsBlock + '</div>'
    + '</div>'
    + '<table><thead><tr><th class="nc">#</th><th class="ic">Item</th><th class="uc" style="text-align:right">Unit Price</th><th class="qc" style="text-align:center">Qty</th><th class="tc" style="text-align:right">Total</th></tr></thead><tbody>' + itemRows + '</tbody></table>'
    + '<div class="bottom">'
    + '<div class="words">' + (receipt.amountInWords ? '<div class="iw"><span style="text-transform:uppercase;font-size:8px;letter-spacing:.07em;color:#94a3b8">Amount in words</span><br>' + esc(receipt.amountInWords) + '</div>' : '') + '</div>'
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

// Inline preview variant: returns `<style>…</style>` + the page markup with every
// CSS selector prefixed by `#<scopeId>`, safe to embed inside another document
// (used by the Settings receipt-type previews).
export function renderInvoiceFragment(receipt, mode, scopeId) {
  var doc = renderInvoice(receipt, mode);
  var styleMatch = doc.match(/<style>([\s\S]*?)<\/style>/);
  var css = (styleMatch ? styleMatch[1] : '').replace(/@media print\{[\s\S]*$/, '');
  var page = doc.slice(doc.indexOf('<div class="page">'), doc.lastIndexOf('</div></body>'));
  var scope = '#' + scopeId;
  var scoped = css.split('}').map(function (chunk) {
    var i = chunk.indexOf('{');
    if (i < 0) return chunk;
    var sel = chunk.slice(0, i).trim();
    if (!sel) return chunk;
    if (sel === 'body') return scope + chunk.slice(i);
    return scope + ' ' + sel + chunk.slice(i);
  }).join('}');
  return '<style>' + scoped + '</style>' + page;
}
