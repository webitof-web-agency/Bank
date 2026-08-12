import { MemberTransactionDetailPage, DetailRow, StatusBadge } from './detail';
import { Card } from '../../../components/ui/Card';
import { formatTransactionAmount, formatTransactionModeLabel } from './transactionUtils';
import { Sparkles, Layers3, FileText, ShieldCheck } from 'lucide-react';

export function SsaPaidMemberTransactionDetailPage() {
  const customTabs = [
    { id: 'overview', label: 'SSA Summary', icon: Sparkles },
    { id: 'meta', label: 'SSA Details', icon: Layers3 },
    { id: 'journal', label: 'Journal', icon: FileText },
    { id: 'attachments', label: 'SSA Docs', icon: FileText },
    { id: 'audit', label: 'Audit', icon: ShieldCheck }
  ];

  const renderCustomTab = (activeTab, record, details) => {
    if (activeTab === 'overview') {
      return (
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100 px-6">
            <DetailRow label="Voucher No" value={record.voucherNo} />
            <DetailRow label="Date" value={record.date} />
            <DetailRow label="Member Code" value={record.partyCode} />
            <DetailRow label="Member Name" value={lookups => {
              const party = lookups?.members?.find(m => m.code === record.partyCode);
              return party ? `${party.code} - ${party.name}` : record.partyCode;
            }} />
          </div>
        </Card>
      );
    }
    if (activeTab === 'meta') {
      return (
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100 px-6">
            <DetailRow label="Amount" value={formatTransactionAmount(record.amount || 0)} />
            <DetailRow label="Paymode" value={formatTransactionModeLabel(details.payMode || record.mode)} />
            <DetailRow label="Cheque No" value={record.instrumentNo || details.instrumentNo || '-'} />
            <DetailRow label="Cheque Date" value={record.instrumentDate || details.instrumentDate || '-'} />
            <DetailRow label="Total Amount" value={formatTransactionAmount(record.amount || 0)} />
            <DetailRow label="Fixed Settlement" value={details.fixedSettlement || '-'} />
            <DetailRow label="Send SMS" value={details.sms ? 'Yes' : 'No'} />
            <DetailRow label="Narration" value={record.narration || details.narration || '-'} />
            <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
          </div>
        </Card>
      );
    }
    return null;
  };

  return (
    <MemberTransactionDetailPage
      sectionKey="member"
      itemKey="ssa-paid-member"
      detailPathBase="/app/transactions/member/ssa-paid"
      customTabs={customTabs}
      renderCustomTab={renderCustomTab}
    />
  );
}

export default SsaPaidMemberTransactionDetailPage;


