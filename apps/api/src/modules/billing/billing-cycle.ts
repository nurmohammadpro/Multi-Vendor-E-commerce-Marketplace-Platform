export type BillingCycle = 'monthly' | 'yearly';

/** Fallback trial length when a plan does not define one. */
export const DEFAULT_TRIAL_DAYS = 15;

/**
 * Next renewal date for a billing cycle.
 *
 * Calendar arithmetic, not day counting: a monthly cycle renews on the same
 * day of the next month, so a store billed on the 31st is not charged every
 * 30 days and short months are handled by the Date rollover. A yearly cycle
 * adds a year the same way.
 */
export function computeRenewalAt(billingCycle: BillingCycle, from: Date = new Date()): string {
  const renewalAt = new Date(from);
  if (billingCycle === 'yearly') {
    renewalAt.setFullYear(renewalAt.getFullYear() + 1);
  } else {
    renewalAt.setMonth(renewalAt.getMonth() + 1);
  }
  return renewalAt.toISOString();
}

/** End of a free trial, used as the subscription's first `renewal_at`. */
export function computeTrialEnd(trialDays: number, from: Date = new Date()): string {
  const trialEnd = new Date(from);
  trialEnd.setDate(trialEnd.getDate() + Math.max(0, Math.trunc(trialDays || 0)));
  return trialEnd.toISOString();
}
