// Delivery challan document — consignor/consignee, truck, and item lines.
// Self-contained HTML printed through a hidden iframe.

var money = function (v) { return Number(v ?? 0).toFixed(2); };
var qty = function (v) {
  var n = Number(v ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
};
function esc(v) {
  return String(v || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('\n', '<br>');
}

export function renderChallan(challan) {
  var store = challan.store || {};
  var supplier = challan.supplier || {};
  var items = challan.items || [];
  var dateStr = challan.date
    ? new Date(challan.date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });

  var rows = items.map(function (item, idx) {
    return '<tr>' +
      '<td class="nc">' + (idx + 1) + '</td>' +
      '<td>' + esc(item.productName || 'Item') + (item.skuCode ? '<div class="sku">' + esc(item.skuCode) + '</div>' : '') + '</td>' +
      '<td class="qc">' + qty(item.qty) + (item.unit ? ' ' + esc(item.unit) : '') + '</td>' +
      '</tr>';
  }).join('');

  var meta = [
    ['Challan No', challan.challanNo || challan.deliveryNo || '—'],
    ['Date', dateStr],
    ['Order Ref', challan.orderRef || '—'],
    ['Truck No', challan.truckNo || '—'],
    ['Driver', [challan.driverName, challan.driverPhone].filter(Boolean).join(' · ') || '—'],
  ].map(function (pair) {
    return '<div class="mr"><span class="mk">' + esc(pair[0]) + '</span><span class="mv">' + esc(pair[1]) + '</span></div>';
  }).join('');

  return '<!doctype html><html><head><meta charset="utf-8"><title>Challan ' + esc(challan.deliveryNo || challan.challanNo || '') + '</title><style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:#1e293b;font-size:12px;line-height:1.4}' +
    '.page{max-width:820px;margin:0 auto;padding:24px}' +
    '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:14px}' +
    '.title{font-size:20px;font-weight:700;letter-spacing:-.01em}' +
    '.store{font-size:11px;color:#475569;margin-top:4px}' +
    '.meta{margin-top:14px;display:grid;gap:3px}' +
    '.mr{display:flex;gap:8px;font-size:11px}.mk{color:#64748b;min-width:74px}.mv{font-weight:600}' +
    '.parties{display:flex;gap:16px;margin:16px 0;border:1px solid #e2e8f0;border-radius:6px;padding:12px}' +
    '.party{flex:1}.plabel{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:4px}' +
    '.pname{font-weight:600;font-size:13px}.pmeta{font-size:11px;color:#475569}' +
    'table{width:100%;border-collapse:collapse;margin-top:6px}' +
    'th{background:#f8fafc;color:#475569;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:.06em;padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}' +
    'td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:12px}' +
    '.nc{width:32px;color:#94a3b8}.qc{text-align:right;width:120px;font-family:monospace}' +
    '.sku{font-size:10px;color:#94a3b8}' +
    '.note{margin-top:14px;font-size:11px;color:#475569}' +
    '.sign{display:flex;justify-content:space-between;gap:24px;margin-top:48px}' +
    '.sign div{flex:1;border-top:1px solid #94a3b8;padding-top:6px;font-size:10px;color:#64748b;text-align:center}' +
    '@media print{@page{margin:12mm;size:A4}}' +
    '</style></head><body><div class="page">' +
    '<div class="top"><div><div class="title">Delivery Challan</div>' +
    '<div class="store">' + esc(store.name || 'Store') + (store.address ? ' · ' + esc(store.address) : '') + (store.phone ? ' · ' + esc(store.phone) : '') + '</div></div>' +
    '<div class="meta">' + meta + '</div></div>' +
    '<div class="parties">' +
    '<div class="party"><div class="plabel">Consignor (Company)</div><div class="pname">' + esc(supplier.companyName || '—') + '</div>' +
    (supplier.contactName ? '<div class="pmeta">' + esc(supplier.contactName) + '</div>' : '') +
    (supplier.phone ? '<div class="pmeta">' + esc(supplier.phone) + '</div>' : '') + '</div>' +
    '<div class="party"><div class="plabel">Consignee (Store)</div><div class="pname">' + esc(store.name || '—') + '</div>' +
    (store.address ? '<div class="pmeta">' + esc(store.address) + '</div>' : '') + '</div>' +
    '</div>' +
    '<table><thead><tr><th class="nc">#</th><th>Item</th><th class="qc">Quantity</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    (challan.note ? '<div class="note"><strong>Note:</strong> ' + esc(challan.note) + '</div>' : '') +
    '<div class="sign"><div>Received By</div><div>Driver</div><div>Authorised Signatory</div></div>' +
    '</div></body></html>';
}

export function openChallanPrintWindow(challan) {
  if (typeof document === 'undefined') return false;
  var iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.srcdoc = renderChallan(challan);
  document.body.appendChild(iframe);
  var cleanup = function () {
    window.setTimeout(function () { iframe.remove(); }, 1200);
  };
  iframe.onload = function () {
    var frameWindow = iframe.contentWindow;
    if (!frameWindow) { cleanup(); return; }
    frameWindow.focus();
    frameWindow.print();
    cleanup();
  };
  return true;
}
