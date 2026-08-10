import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';

export function UserRightsPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.roles.list(token)
      .then((response) => {
        if (!mounted) return;
        setRows(response.data || []);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const columns = [
    { key: 'code', label: 'Code', render: (row) => row.code },
    { key: 'name', label: 'Role', render: (row) => row.name },
    { key: 'permissions', label: 'Permissions', render: (row) => String((row.permissions || []).length) },
    { key: 'actions', label: 'Actions', align: 'right', render: () => <Button size="sm" variant="outline" onClick={() => navigate('/app/roles')}>Open Roles</Button> }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">User Rights</h1>
        <p className="mt-1 text-sm text-slate-500">Prototype ke rights management ko existing roles module se map kiya gaya hai.</p>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3 text-slate-700">
          <ShieldCheck size={18} />
          <span className="text-sm font-semibold">Role Based Access Control</span>
        </div>
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading roles...</div>
        ) : (
          <Table columns={columns} data={rows} emptyMessage="No roles found." defaultRowsPerPage={8} />
        )}
      </Card>
    </div>
  );
}

export default UserRightsPage;

