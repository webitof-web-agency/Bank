import { api } from '../../api/api';
import { serializeDocumentMap } from '../../components/master/documentUtils';

export function buildDocumentUploadFormData(file, { moduleName, entityId, documentType }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('moduleName', moduleName);
  if (entityId) formData.append('entityId', entityId);
  if (documentType) formData.append('documentType', documentType);
  return formData;
}

export async function uploadDocumentMap(token, documents = {}, { moduleName, entityId }) {
  const uploaded = serializeDocumentMap(documents);

  for (const [key, value] of Object.entries(documents || {})) {
    if (!value?.file) continue;
    const response = await api.files.upload(token, buildDocumentUploadFormData(value.file, {
      moduleName,
      entityId,
      documentType: key
    }));
    const fileRecord = response.data?.[0] || response.data;
    if (!fileRecord) {
      throw new Error(`Upload failed for ${key}`);
    }
    uploaded[key] = {
      fileId: fileRecord.id,
      viewUrl: fileRecord.viewUrl,
      originalName: fileRecord.originalName || value.file.name,
      documentType: key,
      mimeType: fileRecord.mimeType || value.file.type || '',
      sizeBytes: fileRecord.sizeBytes || value.file.size || 0,
      uploadedAt: fileRecord.createdAt || new Date().toISOString()
    };
  }

  return uploaded;
}

