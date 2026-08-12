import { MemberTransactionDetailPage, DetailRow, SimpleTable } from './detail';
import { Card } from '../../../components/ui/Card';
import { formatTransactionAmount, formatTransactionModeLabel } from './transactionUtils';
import { Sparkles, Layers3, FileText, ShieldCheck } from 'lucide-react';

export function RecoveryMemberTransactionDetailPage() {
  const customTabs = [
    { id: 'overview', label: 'Recovery Summary', icon: Sparkles },
    { id: 'meta', label: 'Recovery Details', icon: Layers3 },
    { id: 'journal', label: 'Journal', icon: FileText },
    { id: 'attachments', label: 'Recovery Docs', icon: FileText },
    { id: 'audit', label: 'Audit', icon: ShieldCheck }
  ];

  const renderCustomTab = (activeTab, record, details) => {
    if (activeTab === 'overview') {
      const recoveryLines = Array.isArray(details.recoveryLines) ? details.recoveryLines : [];
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
            <DetailRow label="Branch" value={record.branchCode} />
            <DetailRow label="Lines" value={String(recoveryLines.length || 0)} />
          </div>
        </Card>
      );
    }
    if (activeTab === 'meta') {
      const recoveryLines = Array.isArray(details.recoveryLines) ? details.recoveryLines : [];
      return (
        <div className="space-y-6">
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100 px-6">
              <DetailRow label="Amount" value={formatTransactionAmount(record.amount || 0)} />
              <DetailRow label="Mode" value={formatTransactionModeLabel(record.mode)} />
              <DetailRow label="Instrument No" value={record.instrumentNo || details.instrumentNo || '-'} />
              <DetailRow label="Instrument Date" value={record.instrumentDate || details.instrumentDate || '-'} />
              <DetailRow label="Settlement Account" value={details.settlementAccount || '-'} />
              <DetailRow label="Narration" value={record.narration || details.narration || '-'} />
              <DetailRow label="Status" value={<StatusBadge status={record.status} />} />
            </div>
          </Card>
          {recoveryLines.length > 0 && (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <SimpleTable
                headers={['Member', 'Head', 'Amount', 'Memo']}
                rows={recoveryLines.map((line, index) => ({
                  key: `${line.memberCode || line.member || index}`,
                  cells: [
                    line.memberCode || line.member || '-',
                    line.head || '-',
                    formatTransactionAmount(line.amount ?? line.total ?? 0),
                    line.memo || '-'
                  ]
                }))}
                emptyMessage="No recovery lines found."
              />
            </Card>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <MemberTransactionDetailPage
      sectionKey="member"
      itemKey="recovery-member"
      detailPathBase="/app/transactions/member/recovery"
      customTabs={customTabs}
      renderCustomTab={renderCustomTab}
    />
  );
}

export default RecoveryMemberTransactionDetailPage;



