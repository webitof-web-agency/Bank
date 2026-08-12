import { MemberTransactionDetailPage, DetailRow } from './detail';
import { Card } from '../../../components/ui/Card';
import { formatTransactionAmount, formatTransactionModeLabel } from './transactionUtils';
import { Sparkles, Layers3, FileText, ShieldCheck } from 'lucide-react';

export function InsurancePaidMemberTransactionDetailPage() {
  const customTabs = [
    { id: 'overview', label: 'Insurance Summary', icon: Sparkles },
    { id: 'meta', label: 'Insurance Details', icon: Layers3 },
    { id: 'journal', label: 'Journal', icon: FileText },
    { id: 'attachments', label: 'Insurance Docs', icon: FileText },
    { id: 'audit', label: 'Audit', icon: ShieldCheck }
  ];

  const renderCustomTab = (activeTab, record, details) => {
    if (activeTab === 'overview') {
      return (
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100 px-6">
            <DetailRow label="Voucher No" value={record.voucherNo} />
            <DetailRow label="Date" value={record.date} />
            <DetailRow label="Transaction Type" value={record.transactionType} />
            <DetailRow label="Party Type" value={record.partyType} />
            <DetailRow label="Settlement A/c" value={details.settlementAccount || '-'} />
            <DetailRow label="Branch" value={record.branchCode} />
            <DetailRow label="FY Code" value={record.fyCode} />
          </div>
        </Card>
      );
    }
    if (activeTab === 'meta') {
      return (
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100 px-6">
            <DetailRow label="Settlement Account" value={details.settlementAccount || '-'} />
            <DetailRow label="Premium Amount" value={formatTransactionAmount(record.amount || 0)} />
            <DetailRow label="Policy No" value={details.policyNo || '-'} />
            <DetailRow label="Claim Ref" value={details.claimRef || '-'} />
            <DetailRow label="Mode" value={formatTransactionModeLabel(record.mode)} />
            <DetailRow label="Instrument No" value={record.instrumentNo || details.instrumentNo || '-'} />
            <DetailRow label="Instrument Date" value={record.instrumentDate || details.instrumentDate || '-'} />
            <DetailRow label="Narration" value={record.narration || details.narration || '-'} />
          </div>
        </Card>
      );
    }
    return null;
  };

  return (
    <MemberTransactionDetailPage
      sectionKey="member"
      itemKey="insurance-paid-member"
      detailPathBase="/app/transactions/member/insurance-paid"
      customTabs={customTabs}
      renderCustomTab={renderCustomTab}
    />
  );
}

export default InsurancePaidMemberTransactionDetailPage;

