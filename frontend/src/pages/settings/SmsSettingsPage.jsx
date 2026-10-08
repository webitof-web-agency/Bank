import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  SmsConnectivityTestCard,
  SmsGeneralConfigCard,
  SmsLoadErrorCard,
  SmsLogFilters,
  SmsLogTable,
  SmsReadinessCard,
  SmsTemplateForm,
  SmsTemplatesTable
} from './sms/SmsSettingsSections';
import {
  EMPTY_LOG_FILTERS,
  TEST_EVENT,
  buildLogQuery,
  computeSsaReadiness,
  saveSmsTemplate,
  templateAvailableVariables,
  templateToDraft,
  validateTemplateDraft
} from './sms/smsSettingsUtils';

// Settings -> SMS. Shows whether Flowit is set up (never its secrets), lets
// an administrator manage the DLT templates, and lists recent SMS. It never
// turns SMS on: SMS_ENABLED and the credentials stay in the backend .env.
export function SmsSettingsPage() {
  const { token, hasPermission } = useAuth();
  const canWrite = hasPermission('settings.write');
  const [status, setStatus] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [logLoading, setLogLoading] = useState(false);
  const [filters, setFilters] = useState(EMPTY_LOG_FILTERS);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testConfirming, setTestConfirming] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const loadMessages = useCallback(async (nextFilters) => {
    setLogLoading(true);
    try {
      const response = await api.sms.messages(token, buildLogQuery(nextFilters));
      setMessages(response.data || []);
    } catch (error) {
      toast.error(error.message || 'Unable to load the SMS log');
    } finally {
      setLogLoading(false);
    }
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusResponse, templatesResponse] = await Promise.all([api.sms.configStatus(token), api.sms.templates(token)]);
      setStatus(statusResponse.data || null);
      setTemplates(templatesResponse.data || []);
      setLoadError('');
    } catch (error) {
      // Without the status, the readiness and configuration cards would show
      // "not configured" as if it were known: show the error instead.
      setStatus(null);
      setLoadError(error.message || 'Unable to load SMS settings');
      toast.error(error.message || 'Unable to load SMS settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial load (both callbacks change only with the token); log filters
  // apply on submit.
  useEffect(() => {
    loadAll();
    loadMessages(EMPTY_LOG_FILTERS);
  }, [loadAll, loadMessages]);

  const readiness = useMemo(() => computeSsaReadiness(status, templates), [status, templates]);
  const validation = useMemo(
    () => (editing && draft ? validateTemplateDraft(draft, templateAvailableVariables(editing)) : null),
    [editing, draft]
  );

  function openEditor(template) {
    setEditing(template);
    setDraft(templateToDraft(template));
  }

  function closeEditor() {
    setEditing(null);
    setDraft(null);
  }

  async function handleSave() {
    if (!editing || !draft) return;
    setSaving(true);
    try {
      const saved = await saveSmsTemplate(api.sms, token, editing, draft);
      if (saved) setTemplates((current) => current.map((row) => (row.eventCode === saved.eventCode ? saved : row)));
      toast.success(`${saved?.label || 'SMS template'} saved${saved?.isEnabled ? '' : ' (disabled)'}`);
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save the SMS template');
    } finally {
      setSaving(false);
    }
  }

  // One test SMS, only after the confirmation; the backend decides the
  // sender, template, number and OTP and enforces a cooldown.
  async function handleTestSend() {
    setTestSending(true);
    setTestResult(null);
    try {
      const response = await api.sms.testSend(token);
      setTestResult(response.data || null);
    } catch (error) {
      const problems = Array.isArray(error.payload?.problems) ? error.payload.problems.join(' ') : '';
      setTestResult({ error: problems ? `Not sent. ${problems}` : (error.message || 'Unable to send the test SMS') });
    } finally {
      setTestSending(false);
      setTestConfirming(false);
      loadMessages(filters);
    }
  }

  function refresh() {
    loadAll();
    loadMessages(filters);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <MessageSquare className="text-blue-600" /> SMS
          </h1>
          <p className="mt-1 text-sm text-slate-500">Flowit SMS configuration, DLT templates and the recent SMS log.</p>
        </div>
        <Button type="button" variant="outline" onClick={refresh} disabled={loading || logLoading}>
          <RefreshCw size={16} className={loading || logLoading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      {loading && !status ? (
        <Card className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Loading SMS settings...</Card>
      ) : loadError || !status ? (
        <SmsLoadErrorCard message={loadError || 'SMS settings are not available.'} onRetry={refresh} />
      ) : (
        <>
          <SmsReadinessCard readiness={readiness} />
          <SmsGeneralConfigCard status={status} />

          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Templates</h2>
              <p className="text-sm text-slate-500">
                One template per SMS event. The DLT message ID and variable order must match the text approved on DLT.
                {canWrite ? '' : ' You can view templates; editing needs the settings write permission.'}
              </p>
            </div>
            <SmsTemplatesTable templates={templates} canEdit={canWrite} onEdit={openEditor} />
          </Card>

          {canWrite ? (
            <SmsConnectivityTestCard
              test={status?.test}
              canWrite={canWrite}
              confirming={testConfirming}
              sending={testSending}
              result={testResult}
              onRequestSend={() => { setTestResult(null); setTestConfirming(true); }}
              onConfirm={handleTestSend}
              onCancel={() => setTestConfirming(false)}
            />
          ) : null}
        </>
      )}

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">SMS Log</h2>
          <p className="text-sm text-slate-500">The most recent 200 matching messages. Numbers are masked; message text is never stored.</p>
        </div>
        <div className="mb-4">
          <SmsLogFilters
            filters={filters}
            eventCodes={[...templates.map((template) => template.eventCode), TEST_EVENT]}
            onChange={setFilters}
            onApply={() => loadMessages(filters)}
            onReset={() => { setFilters(EMPTY_LOG_FILTERS); loadMessages(EMPTY_LOG_FILTERS); }}
          />
        </div>
        <SmsLogTable messages={messages} />
      </Card>

      <Modal
        open={Boolean(editing)}
        title={`Edit SMS template: ${editing?.label || editing?.eventCode || ''}`}
        subtitle="Changes apply to the next SMS sent for this event."
        onClose={closeEditor}
        width="min(760px, 96vw)"
        footer={(
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={saving || !validation?.valid}>
              <Save size={16} /> {saving ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        )}
      >
        {editing && draft ? (
          <SmsTemplateForm template={editing} draft={draft} validation={validation} defaultSenderId={status?.senderId || ''} onChange={setDraft} />
        ) : null}
      </Modal>
    </div>
  );
}

export default SmsSettingsPage;
