import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, PageHeaderHeading, PageHeaderDescription, PageHeaderActions } from '../../../../components/ui/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../../../../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../../../components/ui/Table';
import { Badge } from '../../../../components/ui/Badge';
import { useAuth } from '../../../../context/AuthContext';
import { api } from '../../../../api/api';
import { formatCurrency, formatDateTime } from '../../../../utils/formatters';
import UploadModal from './UploadModal';
import { Upload, Eye } from 'lucide-react';

export default function RecoveryImportList() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const res = await api.recoveryImport.getBatches(token);
      if (res.success) {
        setBatches(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [token]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'READY': return 'bg-blue-100 text-blue-800';
      case 'ACCEPTED': return 'bg-amber-100 text-amber-800';
      case 'POSTED': return 'bg-green-100 text-green-800';
      case 'INVALID': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader>
        <div>
          <PageHeaderHeading>Recovery Imports</PageHeaderHeading>
          <PageHeaderDescription>Manage bulk recovery uploads and allocations.</PageHeaderDescription>
        </div>
        <PageHeaderActions>
          <Button onClick={() => setUploadModalOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import File
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Import Batches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Upload Date</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Rows (Valid)</TableHead>
                  <TableHead>Total Imported</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : batches.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No imports found.</TableCell></TableRow>
                ) : (
                  batches.map(batch => (
                    <TableRow key={batch.id}>
                      <TableCell>{formatDateTime(batch.uploadedAt)}</TableCell>
                      <TableCell className="font-medium">{batch.fileName}</TableCell>
                      <TableCell>
                        {batch.totalRows} ({batch.validRows} valid)
                        {batch.errorRows > 0 && <span className="ml-2 text-xs text-red-600 font-bold">{batch.errorRows} err</span>}
                      </TableCell>
                      <TableCell>{formatCurrency(batch.totalImportedAmount)}</TableCell>
                      <TableCell>
                        <Badge className={`hover:bg-opacity-80 border-none font-semibold ${getStatusColor(batch.status)}`}>
                          {batch.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/app/transactions/member/recovery-import/${batch.id}`)}>
                          <Eye className="w-4 h-4 mr-2" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <UploadModal 
        isOpen={uploadModalOpen} 
        onClose={() => setUploadModalOpen(false)} 
        onUploadSuccess={(batch) => {
          navigate(`/app/transactions/member/recovery-import/${batch.id}`);
        }}
        token={token} 
      />
    </div>
  );
}
