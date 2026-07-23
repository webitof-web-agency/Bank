import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../api/api';
import { ArrowLeft } from 'lucide-react';
import { MemberForm } from './form';
import {
  buildMemberPayload,
  createEmptyMemberDraft,
  createMemberDraftFromRecord,
  prepareMemberAvatarFile
} from './memberUtils';
import { uploadDocumentMap } from '../documentUpload';

export function MemberFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(createEmptyMemberDraft());
  const [branches, setBranches] = useState([]);
  const [members, setMembers] = useState([]);
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarCleared, setAvatarCleared] = useState(false);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      api.resources.list('/banking/masters/branches', token),
      isEdit ? api.resources.get('/banking/masters/members', id, token) : api.resources.list('/banking/masters/members', token)
    ])
      .then(([branchesRes, memberRes]) => {
        if (!mounted) return;
        setBranches(branchesRes.data || []);

        if (isEdit) {
          const record = memberRes.data || {};
          setDraft(createMemberDraftFromRecord(record));
          setAvatarPreview(record.photoUrl || '');
        } else {
          const rows = memberRes.data || [];
          setMembers(rows);
          setDraft(createEmptyMemberDraft(rows));
          setAvatarPreview('');
        }
        setRemovedDocumentIds([]);
        setAvatarFile(null);
        setAvatarCleared(false);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load member data');
        navigate('/app/master/members');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, isEdit, navigate, token]);

  function handleDocumentRemove(key, document) {
    if (document?.fileId) {
      setRemovedDocumentIds((current) => (current.includes(document.fileId) ? current : [...current, document.fileId]));
    }
  }

  async function handleAvatarPick(file) {
    const uploadFile = await prepareMemberAvatarFile(file);
    if (!uploadFile) return;
    const nextPreview = URL.createObjectURL(uploadFile);
    if (avatarPreview && String(avatarPreview).startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(uploadFile);
    setAvatarCleared(false);
    setAvatarPreview(nextPreview);
  }

  function handleAvatarClear() {
    if (avatarPreview && String(avatarPreview).startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(null);
    setAvatarPreview('');
    setAvatarCleared(true);
  }

  useEffect(() => () => {
    if (avatarPreview && String(avatarPreview).startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
  }, [avatarPreview]);

  async function saveMember(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = buildMemberPayload(draft);
      delete payload.documents;

      const baseResponse = isEdit
        ? await api.resources.update('/banking/masters/members', id, payload, token)
        : await api.resources.create('/banking/masters/members', payload, token);
      const savedRecord = baseResponse.data || {};
      const entityId = savedRecord.id || id;
      const folderId = savedRecord.documentsFolderId || null;

      let avatarPayload = {};
      if (avatarFile) {
        const uploadData = new FormData();
        uploadData.append('file', avatarFile);
        uploadData.append('moduleName', 'members');
        if (entityId) uploadData.append('entityId', entityId);
        if (folderId) uploadData.append('folderId', folderId);
        const response = await api.files.upload(token, uploadData);
        const uploaded = response.data?.[0] || response.data;
        if (!uploaded) throw new Error('Profile image upload failed');
        avatarPayload = {
          photoUrl: uploaded.viewUrl,
          photoFileId: uploaded.id
        };
      } else if (avatarCleared) {
        avatarPayload = {
          photoUrl: '',
          photoFileId: null
        };
      }

      const documents = await uploadDocumentMap(token, draft.documents || {}, {
        moduleName: 'members',
        entityId,
        folderId
      });

      const finalPayload = {};
      if (Object.keys(avatarPayload).length > 0) {
        Object.assign(finalPayload, avatarPayload);
      }
      if (Object.keys(documents).length > 0) {
        finalPayload.documents = documents;
      }
      if (Object.keys(finalPayload).length > 0) {
        await api.resources.update('/banking/masters/members', entityId, finalPayload, token);
      }

      if (removedDocumentIds.length > 0) {
        for (const fileId of removedDocumentIds) {
          try {
            await api.files.remove(token, fileId);
          } catch (removeError) {
            console.warn('Failed to remove member document file', fileId, removeError);
          }
        }
      }

      toast.success(isEdit ? 'Member updated' : 'Member created');
      navigate(isEdit ? `/app/master/members/${entityId}` : '/app/master/members');
    } catch (error) {
      toast.error(error.message || 'Unable to save member');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-[14px] text-slate-500">Loading member...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 mb-2">
        <button type="button" onClick={() => navigate(isEdit ? `/app/master/members/${id}` : '/app/master/members')} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">{isEdit ? 'Edit Member' : 'New Member'}</span>
      </div>

      <div className="w-full">
        <MemberForm
          value={draft}
          setValue={setDraft}
          branches={branches}
          branchesLoading={false}
          onSubmit={saveMember}
          isEdit={isEdit}
          avatarPreview={avatarPreview}
          avatarBusy={saving}
          onAvatarPick={handleAvatarPick}
          onAvatarClear={handleAvatarClear}
          onDocumentRemove={handleDocumentRemove}
          saving={saving}
          onCancel={() => navigate(isEdit ? `/app/master/members/${id}` : '/app/master/members')}
        />
      </div>
    </div>
  );
}

export default MemberFormPage;
