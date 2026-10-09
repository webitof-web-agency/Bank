import { toast } from 'sonner';
import { api } from '../../../api/api';
import { describeSmsResult } from './transactionUtils';

const POLL_MS = 1500;
const GIVE_UP_MS = 30000;

// Shows the SMS toast after a save (the save has its own toast). The save
// returns before Flowit answers, so a PENDING SMS shows "Sending SMS..." and
// the same toast is updated once the send settles.
export function followSmsResult(token, voucherId, sms) {
  const first = describeSmsResult(sms);
  if (!first) return;
  if (first.tone !== 'loading') {
    toast[first.tone](first.message);
    return;
  }
  const toastId = toast.loading(first.message);
  const startedAt = Date.now();
  const poll = async () => {
    let current = null;
    try {
      current = (await api.banking.getTransactionVoucherSms(token, voucherId))?.data || null;
    } catch {
      current = null; // a network blip: try again
    }
    const result = describeSmsResult(current);
    if (result && result.tone !== 'loading') {
      toast[result.tone](result.message, { id: toastId });
      return;
    }
    if (Date.now() - startedAt >= GIVE_UP_MS) {
      toast.message('SMS is queued and will be retried. Check Settings -> SMS log.', { id: toastId });
      return;
    }
    setTimeout(poll, POLL_MS);
  };
  setTimeout(poll, POLL_MS);
}
