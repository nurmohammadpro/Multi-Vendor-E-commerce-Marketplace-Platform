// WhatsApp due-reminder helper: builds a wa.me deep link with a pre-filled
// Bangla payment reminder. No gateway needed — opens the owner's own WhatsApp.
export function waReminderLink(phone: string | null | undefined, storeName: string, amount: number, dueText: string): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const msisdn = digits.startsWith('880') ? digits : '880' + digits.replace(/^0/, '');
  const text = encodeURIComponent(
    `আসসালামু আলাইকুম। ${storeName || 'আমাদের দোকান'}-এর কাছে আপনার বকেয়া ${Number(amount || 0).toLocaleString('en-IN')} টাকা (${dueText})। অনুগ্রহ করে পরিশোধ করুন। ধন্যবাদ।`,
  );
  return `https://wa.me/${msisdn}?text=${text}`;
}
