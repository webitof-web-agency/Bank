import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '../../../../components/ui/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../../../components/ui/Table';
import { Badge } from '../../../../components/ui/Badge';
import { Alert, AlertTitle, AlertDescription } from '../../../../components/ui/Alert';
import { useAuth } from '../../../../context/AuthContext';
import { api } from '../../../../api/api';
import { formatCurrency, formatDateTime } from '../../../../utils/formatters';
import { ArrowLeft, RefreshCw, CheckCircle, Send, AlertTriangle } from 'lucide-react';

export default function RecoveryImportDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ batch: null, rows: [] });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      const res = await api.recoveryImport.getBatchRows(token, id);
      if (res.success) setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id, token]);

  const handleAction = async (actionFn, successMsg) => {
    try {
      setActionLoading(true);
      const res = await actionFn(token, id);
      if (res.success) {
        alert(successMsg);
        fetchDetail();
      }
    } catch (err) {
      alert(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'READY': return 'bg-blue-100 text-blue-800';
      case 'ACCEPTED': return 'bg-amber-100 text-amber-800';
      case 'POSTED': return 'bg-green-100 text-green-800';
      case 'INVALID': return 'bg-red-100 text-red-800';
      case 'VALID': return 'bg-green-100 text-green-800';
      case 'SHORT':
      case 'EXTRA': return 'bg-orange-100 text-orange-800';
      default: return 'bg-red-100 text-red-800';
    }
  };

  if (loading) return <div className="p-8 text-center">Loading batch details...</div>;
  if (!data.batch) return <div className="p-8 text-center text-red-500">Batch not found</div>;

  const { batch, rows } = data;
  const isReady = batch.status === 'READY';
  const isAccepted = batch.status === 'ACCEPTED';
  const isPosted = batch.status === 'POSTED';

  // Detect if any row has legacy source metadata to show those columns
  const hasSourceMeta = rows.some(r => r.sourceEmployeeName || r.sourceBranch || r.sourceGrade);

  return (
    <div className="space-y-6">
      <PageHeader>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/app/transactions/member/recovery-import')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <PageHeaderHeading>Batch {batch.fileName}</PageHeaderHeading>
            <PageHeaderDescription>Uploaded {formatDateTime(batch.uploadedAt)}</PageHeaderDescription>
          </div>
        </div>
        <PageHeaderActions>
          {!isPosted && !isAccepted && (
            <Button variant="outline" onClick={() => handleAction(api.recoveryImport.revalidate, 'Revalidated successfully')} disabled={actionLoading}>
              <RefreshCw className="w-4 h-4 mr-2" /> Revalidate All
            </Button>
          )}
          {isReady && (
            <Button onClick={() => handleAction(api.recoveryImport.accept, 'Batch accepted!')} disabled={actionLoading} className="bg-amber-600 hover:bg-amber-700">
              <CheckCircle className="w-4 h-4 mr-2" /> Accept Batch
            </Button>
          )}
          {isAccepted && (
            <Button onClick={() => handleAction(api.recoveryImport.post, 'Batch posted to ledgers!')} disabled={actionLoading} className="bg-green-600 hover:bg-green-700 text-white">
              <Send className="w-4 h-4 mr-2" /> Post to Ledgers
            </Button>
          )}
        </PageHeaderActions>
      </PageHeader>

      {!isReady && !isAccepted && !isPosted && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Batch Invalid</AlertTitle>
          <AlertDescription>
            There are validation errors. You must fix the Member Demand in the Member Master and click <strong>Revalidate All</strong>. All rows must be VALID before the batch can be accepted.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="py-4"><CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle></CardHeader>
          <CardContent><Badge className={getStatusColor(batch.status)}>{batch.status}</Badge></CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4"><CardTitle className="text-sm font-medium text-muted-foreground">Valid Rows</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{batch.validRows} / {batch.totalRows}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4"><CardTitle className="text-sm font-medium text-muted-foreground">Total Imported</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">{formatCurrency(batch.totalImportedAmount)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4"><CardTitle className="text-sm font-medium text-muted-foreground">Total Allocated</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{formatCurrency(batch.totalAllocatedAmount)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Imported Rows Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>S.No.</TableHead>
                  <TableHead>PF No.</TableHead>
                  {hasSourceMeta && <TableHead>Excel Name</TableHead>}
                  {hasSourceMeta && <TableHead>Branch</TableHead>}
                  {hasSourceMeta && <TableHead>Grade</TableHead>}
                  <TableHead className="text-right">Imported Total</TableHead>
                  <TableHead className="text-right">Configured Demand</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Spcl Dep</TableHead>
                  <TableHead className="text-right">CD</TableHead>
                  <TableHead className="text-right">Loan</TableHead>
                  <TableHead className="text-right">LAD</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error / Warning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id} className={row.warnings ? 'bg-amber-50/50' : ''}>
                    <TableCell>{row.sourceRowNo}</TableCell>
                    <TableCell className="font-medium font-mono">{row.pfNo}</TableCell>

                    {hasSourceMeta && (
                      <TableCell className="text-xs">
                        {row.sourceEmployeeName || <span className="text-muted-foreground">—</span>}
                        {row.warnings && row.warnings.includes('SOURCE NAME DIFFERENCE') && (
                          <div className="text-amber-600 font-semibold mt-0.5">⚠ NAME DIFF</div>
                        )}
                      </TableCell>
                    )}
                    {hasSourceMeta && (
                      <TableCell className="text-xs">
                        {row.sourceBranch || <span className="text-muted-foreground">—</span>}
                        {row.warnings && row.warnings.includes('SOURCE BRANCH DIFFERENCE') && (
                          <div className="text-amber-600 font-semibold mt-0.5">⚠ BRANCH DIFF</div>
                        )}
                      </TableCell>
                    )}
                    {hasSourceMeta && (
                      <TableCell className="text-xs">
                        {row.sourceGrade || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}

                    <TableCell className="text-right font-semibold">{formatCurrency(row.importedTotalAmount)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(row.configuredDemandTotal)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(row.allocatedTotal)}</TableCell>

                    <TableCell className="text-right text-xs">
                      {row.allocatedShare > 0 ? formatCurrency(row.allocatedShare) : '-'}
                      {row.configuredShare > 0 && <div className="text-muted-foreground">(D: {formatCurrency(row.configuredShare)})</div>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.allocatedSpecialDeposit > 0 ? formatCurrency(row.allocatedSpecialDeposit) : '-'}
                      {row.configuredSpecialDeposit > 0 && <div className="text-muted-foreground">(D: {formatCurrency(row.configuredSpecialDeposit)})</div>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.allocatedCompulsoryDeposit > 0 ? formatCurrency(row.allocatedCompulsoryDeposit) : '-'}
                      {row.configuredCompulsoryDeposit > 0 && <div className="text-muted-foreground">(D: {formatCurrency(row.configuredCompulsoryDeposit)})</div>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.allocatedRegularLoan > 0 ? formatCurrency(row.allocatedRegularLoan) : '-'}
                      {row.configuredRegularLoan > 0 && <div className="text-muted-foreground">(D: {formatCurrency(row.configuredRegularLoan)})</div>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.allocatedLoanAgainstDeposit > 0 ? formatCurrency(row.allocatedLoanAgainstDeposit) : '-'}
                      {row.configuredLoanAgainstDeposit > 0 && <div className="text-muted-foreground">(D: {formatCurrency(row.configuredLoanAgainstDeposit)})</div>}
                    </TableCell>

                    <TableCell className={`text-right text-xs font-semibold ${row.differenceAmount !== 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {row.differenceAmount !== 0 ? formatCurrency(row.differenceAmount) : '✓'}
                    </TableCell>

                    <TableCell>
                      <Badge className={`whitespace-nowrap ${getStatusColor(row.status)}`}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px]">
                      {row.errorMessage && (
                        <div className="text-red-600 truncate" title={row.errorMessage}>{row.errorMessage}</div>
                      )}
                      {row.warnings && (
                        <div className="text-amber-700 mt-0.5 whitespace-pre-line text-[10px]">{row.warnings}</div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

