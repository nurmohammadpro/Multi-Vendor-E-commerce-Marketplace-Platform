const money = (v) => Number(v ?? 0).toFixed(2);
function esc(v) {
  return String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

export function renderReceipt(receipt, mode) {
  var isA5 = mode === 'laser_a5';
  var store = receipt.store || {};
  var storeMeta = [store.phone, store.email, store.address].filter(Boolean);
  var dateStr = receipt.printedAt
    ? new Date(receipt.printedAt).toLocaleDateString('en-BD', { year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit' })
    : new Date().toLocaleString('en-BD');
  var barcode = (receipt.items && receipt.items[0] && receipt.items[0].barcode) || receipt.saleNo || '';
  var totals = receipt.totals || {};
  var total = Number(totals.total || 0);
  var paid = Number(totals.paid || 0);
  var due = Number(totals.due || 0);
  var change = Number(totals.change || 0);
  var discount = Number(totals.discount || 0);

  var itemRows = (receipt.items || []).map(function(item, idx) {
    var disc = Number(item.discountAmount || 0);
    var lt = Number(item.lineTotal || 0);
    var discCell = disc > 0
      ? '<td class="dc">-' + money(disc) + '</td>'
      : '<td class="dc">—</td>';
    var skuHtml = item.skuCode ? '<br><span class="sku">' + esc(item.skuCode) + '</span>' : '';
    return '<tr><td class="ic">' + (idx+1) + '. ' + esc(item.name||'Item') + skuHtml + '</td><td class="qc">' + Number(item.qty||0) + '</td><td class="pc">' + money(item.unitPrice) + '</td>' + discCell + '<td class="tc">' + money(lt) + '</td></tr>';
  }).join('');

  var payRows = (receipt.payments || []).map(function(p) {
    var label = esc(p.paymentMethod||'payment') + (p.status ? ' (' + esc(p.status) + ')' : '');
    return '<div class="pr"><span>' + label + '</span><span>' + money(p.amount) + '</span></div>';
  }).join('');

  var custSec = receipt.customer && receipt.customer.name
    ? '<div class="cl">Bill To</div><div class="cn">' + esc(receipt.customer.name) + '</div>' +
      (receipt.customer.phone ? '<div class="cd">' + esc(receipt.customer.phone) + '</div>' : '') +
      (receipt.customer.shopName ? '<div class="cd">' + esc(receipt.customer.shopName) + '</div>' : '')
    : '<div class="cl">Walk-in Customer</div>';

  var logoHtml = store.logoUrl
    ? '<img src="' + esc(store.logoUrl) + '" alt="logo" style="max-width:60px;max-height:30px;object-fit:contain;margin-top:3px">'
    : '';

  var css = [
    '*{margin:0;padding:0;box-sizing:border-box}',
    'body{font-family:"Segoe UI",system-ui,sans-serif;background:#fff;color:#1e293b}',
    '.page{max-width:' + (isA5?'148mm':'80mm') + ';margin:0 auto;padding:' + (isA5?'8mm 10mm':'12px 8px') + '}',
    '.header{display:flex;justify-content:space-between;border-bottom:3px double #1e293b;padding-bottom:8px;margin-bottom:8px;' + (!isA5?'flex-direction:column;gap:4px;':'') + '}',
    '.hl{flex:1}',
    '.hr{text-align:' + (isA5?'right':'left') + ';' + (isA5?'border-left:1px dashed #cbd5e1;padding-left:12px;min-width:160px;':'') + '}',
    '.sn{font-size:' + (isA5?'16px':'13px') + ';font-weight:700;margin-bottom:1px}',
    '.sm{font-size:' + (isA5?'11px':'10px') + ';color:#475569;line-height:1.5}',
    '.it{font-size:' + (isA5?'13px':'11px') + ';font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:1px}',
    '.ino{font-size:' + (isA5?'15px':'12px') + ';font-weight:600}',
    '.cl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-top:3px}',
    '.cn{font-size:' + (isA5?'12px':'10px') + ';font-weight:600}',
    '.cd{font-size:' + (isA5?'11px':'9px') + ';color:#475569;line-height:1.4}',
    'h2{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin:8px 0 3px}',
    'table{width:100%;border-collapse:collapse;font-size:' + (isA5?'11px':'9px') + '}',
    'th{background:#f1f5f9;color:#475569;font-weight:600;font-size:8px;text-transform:uppercase;letter-spacing:.06em;padding:' + (isA5?'6px 6px':'3px 3px') + ';border-bottom:2px solid #e2e8f0;text-align:left}',
    'td{padding:' + (isA5?'5px 6px':'3px 3px') + ';border-bottom:1px solid #f1f5f9}',
    '.ic{font-weight:500}.qc{text-align:center;width:' + (isA5?'36px':'28px') + '}',
    '.pc{text-align:right;width:' + (isA5?'65px':'52px') + ';font-family:monospace}',
    '.dc{text-align:right;width:' + (isA5?'55px':'42px') + ';color:#b45309;font-size:9px}',
    '.tc{text-align:right;width:' + (isA5?'70px':'56px') + ';font-weight:600;font-family:monospace}',
    '.sku{font-size:8px;color:#94a3b8}',
    '.totals{margin-top:8px;margin-left:auto;width:' + (isA5?'240px':'100%') + '}',
    '.tr{display:flex;justify-content:space-between;padding:3px 0;font-size:' + (isA5?'12px':'10px') + ';border-bottom:1px dotted #e2e8f0}',
    '.tr .lb{color:#64748b}.tr .vl{font-family:monospace;font-weight:600}',
    '.tr.gt{font-size:' + (isA5?'15px':'12px') + ';font-weight:700;border-bottom:3px double #1e293b;border-top:1px solid #1e293b;padding:6px 0;margin-top:3px}',
    '.due{color:#b45309}.change{color:#16a34a}',
    '.pr{display:flex;justify-content:space-between;padding:2px 0;font-size:' + (isA5?'11px':'9px') + '}',
    '.bs{text-align:center;margin-top:10px;padding-top:6px;border-top:1px dashed #e2e8f0}',
    '.bt{font-family:monospace;font-size:8px;letter-spacing:.1em;color:#64748b;margin-top:1px}',
    '.ft{text-align:center;margin-top:8px;padding-top:4px;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:8px}',
    '@media print{@page{margin:0;size:' + (isA5?'A5':'80mm') + ' auto}}'
  ].join('\n');

  var storeMetaHtml = storeMeta.map(function(l) { return '<div class="sm">' + esc(l) + '</div>'; }).join('');

  var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(receipt.saleNo||'Invoice') + '</title><style>' + css + '</style></head><body><div class="page">' +
    '<div class="header"><div class="hl"><div class="sn">' + esc(store.name||'Store') + '</div>' + storeMetaHtml + logoHtml + '</div>' +
    '<div class="hr"><div class="it">Invoice</div><div class="ino">' + esc(receipt.saleNo||'—') + '</div><div class="sm">' + esc(dateStr) + '</div>' + custSec + '</div></div>' +
    '<h2>Items</h2><table><thead><tr><th class="ic">Item</th><th class="qc">Qty</th><th class="pc">Price</th><th class="dc">Disc</th><th class="tc">Total</th></tr></thead><tbody>' + itemRows + '</tbody></table>' +
    '<div class="totals">' +
    (discount > 0 ? '<div class="tr"><span class="lb">Discount</span><span class="vl" style="color:#b45309">-' + money(discount) + '</span></div>' : '') +
    '<div class="tr gt"><span>Total</span><span>' + money(total) + '</span></div>' +
    '<div class="tr"><span class="lb">Paid</span><span class="vl">' + money(paid) + '</span></div>' +
    (due > 0 ? '<div class="tr"><span class="lb">Due</span><span class="vl due">' + money(due) + '</span></div>' : '') +
    (change > 0 ? '<div class="tr"><span class="lb">Change</span><span class="vl change">' + money(change) + '</span></div>' : '') +
    '</div>' +
    (payRows ? '<h2>Payments</h2>' + payRows : '') +
    (store.footer ? '<div class="ft">' + esc(store.footer) + '</div>' : '') +
    '<div class="bs">' +
    (barcode ? '<img src="https://barcode.tec-it.com/barcode.ashx?data=' + encodeURIComponent(barcode) + '&code=Code128&translate-esc=true&dpi=96&imagetype=png" style="max-width:200px;height:40px" alt="Barcode">' : '') +
    '<div class="bt">' + esc(barcode) + '</div></div>' +
    '</div></body></html>';
  return html;
}
