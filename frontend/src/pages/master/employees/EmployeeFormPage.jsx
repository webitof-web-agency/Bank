import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../api/api';
import { ArrowLeft } from 'lucide-react';
import { EmployeeForm } from './form';
import {
  buildEmployeePayload,
  createEmployeeDraftFromRecord,
  prepareEmployeeAvatarFile
} from './employeeUtils';
import { uploadDocumentMap } from '../documentUpload';

export function EmployeeFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    code: '', fullName: '', name: '', username: '', email: '', password: '',
    phone: '', mobileNo: '', address: '', gender: '', designation: '', branchCode: '',
    status: 'Active', isActive: true, roleIds: [], documents: {}
  });
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarCleared, setAvatarCleared] = useState(false);
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.roles.list(token),
      api.resources.list('/banking/masters/branches', token),
      isEdit ? api.users.get(token, id) : Promise.resolve(null)
    ]).then(([rolesRes, branchesRes, userRes]) => {
      if (!mounted) return;
      setRoles(rolesRes.data || []);
      setBranches(branchesRes.data || []);
      
      if (isEdit && userRes?.data) {
        setDraft(createEmployeeDraftFromRecord(userRes.data));
        setAvatarPreview(userRes.data.avatarUrl || '');
      }
    }).catch(error => {
      if (!mounted) return;
      toast.error(error.message || 'Unable to load data');
      navigate('/app/master/employees');
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [id, token, isEdit, navigate]);

  useEffect(() => {
    return () => {
      if (avatarPreview && String(avatarPreview).startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  async function handleAvatarPick(file) {
    const uploadFile = await prepareEmployeeAvatarFile(file);
    if (!uploadFile) return;
    if (avatarPreview && String(avatarPreview).startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(uploadFile);
    setAvatarCleared(false);
    setAvatarPreview(URL.createObjectURL(uploadFile));
  }

  function handleAvatarClear() {
    if (avatarPreview && String(avatarPreview).startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(null);
    setAvatarPreview('');
    setAvatarCleared(true);
  }

  function handleDocumentRemove(key, document) {
    if (document?.fileId) {
      setRemovedDocumentIds((current) => (current.includes(document.fileId) ? current : [...current, document.fileId]));
    }
  }

  async function saveEmployee(event) {
    event.preventDefault();
    setSaving(true);
    try {
      let avatarPayload = {};
      if (avatarFile) {
        const uploadData = new FormData();
        uploadData.append('file', avatarFile);
        uploadData.append('moduleName', 'users');
        if (isEdit) uploadData.append('entityId', id);
        const response = await api.files.upload(token, uploadData);
        const uploaded = response.data?.[0] || response.data;
        if (!uploaded) throw new Error('Avatar upload failed');
        avatarPayload = { avatarUrl: uploaded.viewUrl, avatarFileId: uploaded.id };
      } else if (avatarCleared) {
        avatarPayload = { avatarUrl: '', avatarFileId: null };
      }

      const basePayload = {
        ...buildEmployeePayload(draft),
        ...avatarPayload
      };

      if (!isEdit && draft.password) {
        basePayload.password = draft.password;
      }

      let entityId = id;
      if (!isEdit) {
        const createRes = await api.users.create(token, basePayload);
        entityId = createRes.data?.id;
      }

      if (removedDocumentIds.length > 0) {
        for (const fileId of removedDocumentIds) {
          try {
            await api.files.remove(token, fileId);
          } catch (e) {
            console.warn('Failed to remove document file', fileId, e);
          }
        }
      }

      const documents = await uploadDocumentMap(token, draft.documents || {}, {
        moduleName: 'employees',
        entityId: entityId
      });

      if (isEdit) {
        await api.users.update(token, id, { ...basePayload, documents });
        toast.success('Employee updated');
        navigate(`/app/master/employees/${id}`);
      } else {
        if (Object.keys(documents).length > 0) {
          await api.users.update(token, entityId, { documents });
        }
        toast.success('Employee created');
        navigate('/app/master/employees');
      }
    } catch (error) {
      toast.error(error.message || 'Unable to save employee');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-[14px] text-slate-500">Loading profile...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 mb-2">
        <button type="button" onClick={() => navigate(isEdit ? `/app/master/employees/${id}` : '/app/master/employees')} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">{isEdit ? 'Edit Employee' : 'New Employee'}</span>
      </div>

      <div className="w-full">
        <EmployeeForm
          value={draft}
          setValue={setDraft}
          roles={roles}
          branches={branches}
          branchesLoading={false}
          onSubmit={saveEmployee}
          isEdit={isEdit}
          avatarPreview={avatarPreview}
          avatarBusy={saving}
          onAvatarPick={handleAvatarPick}
          onAvatarClear={handleAvatarClear}
          onDocumentRemove={handleDocumentRemove}
          saving={saving}
          onCancel={() => navigate(isEdit ? `/app/master/employees/${id}` : '/app/master/employees')}
        />
      </div>
    </div>
  );
}
