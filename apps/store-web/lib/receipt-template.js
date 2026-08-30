var money = function(v) { return Number(v ?? 0).toFixed(2); };
function esc(v) { return String(v||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

export function renderReceipt(receipt, mode) {
  var isA5 = mode === 'laser_a5';
  var store = receipt.store || {};
  var storeMeta = [store.phone, store.email, store.address].filter(Boolean);
  var dateStr = receipt.printedAt
    ? new Date(receipt.printedAt).toLocaleDateString('en-BD', { year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit' })
    : new Date().toLocaleString('en-BD');
  var barcode = receipt.saleNo || '';
  var totals = receipt.totals || {};
  var total = Number(totals.total || 0);
  var paid = Number(totals.paid || 0);
  var due = Number(totals.due || 0);
  var change = Number(totals.change || 0);
  var discount = Number(totals.discount || 0);
  var exchange = receipt.exchange || null;
  var exchangeAmount = exchange ? Number(exchange.amount || 0) : 0;
  var grossSubtotal = (receipt.items || []).reduce(function(sum, item) {
    return sum + (item.isExchangeItem ? 0 : Number(item.lineTotal || 0));
  }, 0);

  var fs = isA5 ? {
    body:'11px', sn:'18px', sm:'11px', it:'13px', ino:'15px', cn:'12px', cd:'11px',
    th:'9px', totals:'11px', up:'10px',
    bt:'9px', qc:'50px', uc:'70px', tc:'85px'
  } : {
    body:'12px', sn:'18px', sm:'12px', it:'14px', ino:'16px', cn:'13px', cd:'12px',
    th:'10px', totals:'12px', up:'9px',
    bt:'10px', qc:'48px', uc:'60px', tc:'90px'
  };

  var itemRows = (receipt.items || []).map(function(item, idx) {
    var lt = Number(item.lineTotal || 0);
    var unitPrice = Number(item.unitPrice || 0);
    var details = [];
    if (item.variantLabel) details.push('<span style="font-size:9px;color:#64748b">'+esc(item.variantLabel)+'</span>');
    if (item.skuCode) details.push('<span class="sku">'+esc(item.skuCode)+'</span>');
    var detHtml = details.length ? '<br>'+details.join('<br>') : '';
    return '<tr><td class="ic">'+esc(item.name||'Item')+detHtml+'</td><td class="qc">'+Number(item.qty||0)+'</td>'+(isA5?'<td class="uc">'+money(unitPrice)+'</td>':'')+'<td class="tc">'+money(lt)+'</td></tr>';
  }).filter(Boolean).join('');

  var payRows = (receipt.payments || []).map(function(p) {
    return '<div class="tr"><span>'+esc(p.paymentMethod||'payment')+'</span><span>'+money(p.amount)+'</span></div>';
  }).join('');

  var custSec = receipt.customer && receipt.customer.name
    ? '<div class="cl">Bill To</div><div class="cn">'+esc(receipt.customer.name)+'</div>'+
      (receipt.customer.phone?'<div class="cd">'+esc(receipt.customer.phone)+'</div>':'')+
      (receipt.customer.shopName?'<div class="cd">'+esc(receipt.customer.shopName)+'</div>':'')
    : '<div class="cl">Walk-in Customer</div>';

  var logoHtml = store.logoUrl
    ? '<img src="'+esc(store.logoUrl)+'" alt="logo" style="max-width:60px;max-height:30px;object-fit:contain;margin-top:2px">'
    : '';

  var barcodeHtml = barcode
    ? '<div class="bc-wrap"><div class="bc-frame"><div class="bc-label">Scan to verify</div><img src="https://barcode.tec-it.com/barcode.ashx?data='+encodeURIComponent(barcode)+'&code=Code128&translate-esc=true&dpi=96&imagetype=png" alt="Barcode"><div class="bt">'+esc(barcode)+'</div></div></div>'
    : '';

  var css = [
    '*{margin:0;padding:0;box-sizing:border-box}',
    'body{font-family:"Segoe UI",system-ui,-apple-system,sans-serif;background:#fff;color:#1e293b;font-size:'+fs.body+';line-height:1.4}',
    '.page{max-width:'+(isA5?'100%':'80mm')+';margin:0 auto;padding:'+(isA5?'6mm 8mm':'10px 6px')+'}',
    '.header{display:flex;justify-content:space-between;border-bottom:2px solid #1e293b;padding-bottom:8px;margin-bottom:6px;'+(isA5?'':'flex-direction:column;gap:4px;')+'}',
    '.hl{flex:1;display:flex;flex-direction:column;'+(!isA5?'align-items:center;text-align:center;':'')+'}',
    '.hr{text-align:'+(isA5?'right':'left')+';'+(isA5?'border-left:1px solid #e2e8f0;padding-left:12px;min-width:160px;':'')+'}',
    '.vl{color:#64748b;font-weight:400}',
    '.sn{font-size:'+fs.sn+';font-weight:700;margin-bottom:1px;letter-spacing:-.01em;color:#0f172a}',
    '.sm{font-size:'+fs.sm+';color:#475569;line-height:1.4}',
    '.it{font-size:'+fs.it+';font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:1px}',
    '.ino{font-size:'+fs.ino+';font-weight:600}',
    '.cl{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-top:2px}',
    '.cn{font-size:'+fs.cn+';font-weight:600}',
    '.cd{font-size:'+fs.cd+';color:#475569;line-height:1.3}',
    'h2{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:6px 0 2px}',
    'table{width:100%;border-collapse:collapse;font-size:'+fs.totals+'}',
    'th{background:#f8fafc;color:#475569;font-weight:600;font-size:'+fs.th+';text-transform:uppercase;letter-spacing:.05em;padding:'+(isA5?'5px 4px':'3px 2px')+';border-bottom:1px solid #e2e8f0;text-align:left}',
    'td{padding:'+(isA5?'5px 4px':'3px 2px')+';border-bottom:1px solid #f1f5f9}',
    '.ic{font-weight:500}.qc{text-align:center;width:'+fs.qc+'}',
    '.uc{text-align:right;width:'+fs.uc+';font-family:monospace;font-size:'+fs.up+'}',
    '.tc{text-align:right;width:'+fs.tc+';font-weight:600;font-family:monospace}',
    '.sku{font-size:9px;color:#94a3b8}',
    '.totals{margin-top:6px;margin-left:auto;width:'+(isA5?'200px':'100%')+'}',
    '.tr{display:flex;justify-content:space-between;padding:2px 0;font-size:'+fs.totals+';border-bottom:1px dotted #e2e8f0}',
    '.tr .lb{color:#64748b}.tr .vl{font-family:monospace;font-weight:600;font-size:inherit}',
    '.tr.gt{font-weight:700;border-bottom:2px solid #1e293b;border-top:1px solid #1e293b;padding:4px 0;margin-top:2px}',
    '.due{color:#b45309}',
    '.ft{text-align:center;margin-top:6px;padding-top:3px;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:8px}',
    '.iw{margin-top:6px;padding:4px 6px;background:#f8fafc;font-weight:600;color:#1e293b;border-radius:3px;font-size:10px}',
    '.pb{margin-top:4px;color:#475569;font-size:10px}',
    '.bt{font-family:monospace;font-size:'+fs.bt+';letter-spacing:.08em;color:#64748b;margin-top:1px}',
    '.bc-wrap{display:flex;justify-content:center;margin:6px 0 4px}',
    '.bc-frame{border:1px solid #e2e8f0;border-radius:4px;padding:6px 12px;text-align:center;background:#fafafa}',
    '.bc-frame img{max-width:180px;height:45px}',
    '.bc-label{font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:2px}',
    '@media print{@page{margin:0;size:'+(isA5?'A5':'80mm')+' auto}}'
  ].join('\n');

  var storeMetaHtml = storeMeta.map(function(l) { return '<div class="sm">'+esc(l)+'</div>'; }).join('');

  return '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(receipt.saleNo||'Invoice')+'</title><style>'+css+'</style></head><body><div class="page">'+
    '<div class="header"><div class="hl">'+logoHtml+'<div class="sn">'+esc(store.name||'Store')+'</div>'+storeMetaHtml+'</div>'+
    '<div class="hr"><div class="it">Sales Receipt</div><div class="ino">'+esc(receipt.saleNo||'—')+'</div><div class="sm">'+esc(dateStr)+'</div>'+custSec+'</div></div>'+
    barcodeHtml+
    '<h2>Items</h2><table><thead><tr><th class="ic">Item</th><th class="qc">Qty</th>'+(isA5?'<th class="uc">Unit Price</th>':'')+'<th class="tc">Total</th></tr></thead><tbody>'+itemRows+'</tbody></table>'+
    '<div class="totals">'+
    '<div class="tr"><span class="lb">Sub Total</span><span class="vl">'+money(grossSubtotal)+'</span></div>'+
    (exchangeAmount>0?'<div class="tr"><span class="lb">Exchange</span><span class="vl" style="color:#b45309">-'+money(exchangeAmount)+'</span></div>':'')+
    (discount>0?'<div class="tr"><span class="lb">Discount</span><span class="vl" style="color:#b45309">-'+money(discount)+'</span></div>':'')+
    (Number(totals.vat||0)>0?'<div class="tr"><span class="lb">VAT</span><span class="vl">'+money(totals.vat)+'</span></div>':'')+
    (Number(totals.tax||0)>0?'<div class="tr"><span class="lb">Tax</span><span class="vl">'+money(totals.tax)+'</span></div>':'')+
    '<div class="tr gt"><span>Net Payable</span><span>'+money(total)+'</span></div>'+
    (payRows?'<div class="tr"><span class="lb">Payment:</span><span></span></div>'+payRows:'')+
    (due>0?'<div class="tr"><span class="lb">Due</span><span class="vl due">'+money(due)+'</span></div>':'')+
    (change>0?'<div class="tr"><span class="lb">Change</span><span class="vl">'+money(change)+'</span></div>':'')+
    '</div>'+
    (receipt.amountInWords?'<div class="iw">'+esc(receipt.amountInWords)+'</div>':'')+
    (receipt.preparedBy?'<div class="pb">Seller: '+esc(receipt.preparedBy)+'</div>':'')+
    (store.footer?'<div class="ft">'+esc(store.footer)+'</div>':'<div class="ft">Thank you for your purchase</div>')+
    '</div></body></html>';
}
