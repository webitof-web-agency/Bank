import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/api';
import { ArrowLeft } from 'lucide-react';
import { RoleForm } from './form';
import { mapRoleForForm } from '../../lib/rbac';

export function RoleFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ code: '', name: '', description: '', isSystem: false, isActive: true, permissionCodes: [] });
  const [permissions, setPermissions] = useState([]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.permissions.list(token),
      isEdit ? api.roles.list(token) : Promise.resolve(null)
    ]).then(([permissionsRes, rolesRes]) => {
      if (!mounted) return;
      setPermissions(permissionsRes.data || []);
      
      if (isEdit && rolesRes?.data) {
        const role = rolesRes.data.find(r => r.id === id);
        if (role) {
          setDraft(mapRoleForForm(role));
        } else {
          toast.error('Role not found');
          navigate('/app/roles');
        }
      }
    }).catch(error => {
      if (!mounted) return;
      toast.error(error.message || 'Unable to load data');
      navigate('/app/roles');
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [id, token, isEdit, navigate]);

  async function saveRole(event) {
    event.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await api.roles.update(token, id, draft);
        toast.success('Role updated');
      } else {
        await api.roles.create(token, draft);
        toast.success('Role created');
      }
      navigate('/app/roles');
    } catch (error) {
      toast.error(error.message || 'Unable to save role');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-[14px] text-slate-500">Loading role details...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 mb-2">
        <button type="button" onClick={() => navigate('/app/roles')} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">{isEdit ? 'Edit Role' : 'New Role'}</span>
      </div>

      <div className="w-full">
        <RoleForm
          value={draft}
          permissions={permissions}
          onChange={setDraft}
          onSubmit={saveRole}
          isEdit={isEdit}
          saving={saving}
          onCancel={() => navigate('/app/roles')}
        />
      </div>
    </div>
  );
}
