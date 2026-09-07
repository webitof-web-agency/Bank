import React, { useState, useEffect } from 'react';
import { Archive, Save, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/api';

export function StorageSettingsPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  
  const [config, setConfig] = useState({
    configurationSource: 'environment',
    activeProvider: 'local',
    local: { uploadDir: './uploads', prefix: 'images' },
    gcs: { projectId: '', bucket: '', prefix: 'images', authMode: 'ADC', serviceAccountJson: '', credentialsConfigured: false },
    s3: { region: '', bucket: '', prefix: 'images', authMode: 'default', accessKeyId: '', secretAccessKey: '', sessionToken: '', secretConfigured: false }
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.settings.storage.get(token);
      if (res.success && res.data) {
        setConfig({
           ...res.data,
           gcs: { ...res.data.gcs, serviceAccountJson: '' },
           s3: { ...res.data.s3, secretAccessKey: '', sessionToken: '' }
        });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load storage settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (section, field, value) => {
    if (section) {
      setConfig(prev => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
    } else {
      setConfig(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        provider: config.activeProvider,
        config: config[config.activeProvider]
      };
      const res = await api.settings.storage.test(token, payload);
      setTestResult({ success: res.success, message: res.message });
    } catch (err) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.settings.storage.save(token, config);
      if (res.success) {
        alert('Settings saved successfully');
        loadSettings();
      } else {
        alert(res.message || 'Failed to save settings');
      }
    } catch (err) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Archive className="text-violet-600" />
          Storage Providers
        </h1>
        <p className="text-slate-500 mt-1">Configure where uploaded files and images are stored.</p>
      </div>

      <Card className="p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">General Configuration</h3>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Configuration Source</label>
            <select
              className="w-full h-10 px-3 border border-slate-300 rounded-md focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              value={config.configurationSource}
              onChange={(e) => handleChange(null, 'configurationSource', e.target.value)}
            >
              <option value="environment">Environment Variables</option>
              <option value="site_settings">Site Settings (Database)</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              If Environment Variables is selected, settings configured here will be ignored.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Active Provider</label>
            <select
              className="w-full h-10 px-3 border border-slate-300 rounded-md focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              value={config.activeProvider}
              onChange={(e) => handleChange(null, 'activeProvider', e.target.value)}
              disabled={config.configurationSource === 'environment'}
            >
              <option value="local">Local Storage</option>
              <option value="gcs">Google Cloud Storage</option>
              <option value="s3">Amazon S3</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              The provider to use for new uploads. Changing this does not break existing files.
            </p>
          </div>
        </div>
      </Card>

      {config.configurationSource === 'site_settings' && (
        <>
          {config.activeProvider === 'local' && (
            <Card className="p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Local Storage Configuration</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Upload Directory</label>
                  <input
                    type="text"
                    className="w-full h-10 px-3 border border-slate-300 rounded-md"
                    value={config.local.uploadDir}
                    onChange={(e) => handleChange('local', 'uploadDir', e.target.value)}
                    placeholder="./uploads"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prefix / Path</label>
                  <input
                    type="text"
                    className="w-full h-10 px-3 border border-slate-300 rounded-md"
                    value={config.local.prefix}
                    onChange={(e) => handleChange('local', 'prefix', e.target.value)}
                  />
                </div>
              </div>
            </Card>
          )}

          {config.activeProvider === 'gcs' && (
            <Card className="p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Google Cloud Storage (GCS) Configuration</h3>
              <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Project ID</label>
                  <input
                    type="text"
                    className="w-full h-10 px-3 border border-slate-300 rounded-md"
                    value={config.gcs.projectId}
                    onChange={(e) => handleChange('gcs', 'projectId', e.target.value)}
                    placeholder="my-gcp-project"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Bucket Name</label>
                  <input
                    type="text"
                    className="w-full h-10 px-3 border border-slate-300 rounded-md"
                    value={config.gcs.bucket}
                    onChange={(e) => handleChange('gcs', 'bucket', e.target.value)}
                    placeholder="my-bucket"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prefix</label>
                  <input
                    type="text"
                    className="w-full h-10 px-3 border border-slate-300 rounded-md"
                    value={config.gcs.prefix}
                    onChange={(e) => handleChange('gcs', 'prefix', e.target.value)}
                    placeholder="images"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Authentication Mode</label>
                  <select
                    className="w-full h-10 px-3 border border-slate-300 rounded-md"
                    value={config.gcs.authMode}
                    onChange={(e) => handleChange('gcs', 'authMode', e.target.value)}
                  >
                    <option value="ADC">Application Default Credentials (ADC)</option>
                    <option value="service_account">Service Account JSON</option>
                  </select>
                </div>
              </div>

              {config.gcs.authMode === 'service_account' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Service Account JSON
                    {config.gcs.credentialsConfigured && <span className="ml-2 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Credentials Saved</span>}
                  </label>
                  <textarea
                    className="w-full h-32 p-3 border border-slate-300 rounded-md font-mono text-sm"
                    value={config.gcs.serviceAccountJson}
                    onChange={(e) => handleChange('gcs', 'serviceAccountJson', e.target.value)}
                    placeholder={config.gcs.credentialsConfigured ? "Leave blank to keep existing credentials..." : "Paste JSON here..."}
                  />
                  <p className="text-xs text-slate-500 mt-1">This will be encrypted before saving.</p>
                </div>
              )}
            </Card>
          )}

          {config.activeProvider === 's3' && (
            <Card className="p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Amazon S3 Configuration</h3>
              <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Region</label>
                  <input
                    type="text"
                    className="w-full h-10 px-3 border border-slate-300 rounded-md"
                    value={config.s3.region}
                    onChange={(e) => handleChange('s3', 'region', e.target.value)}
                    placeholder="us-east-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Bucket Name</label>
                  <input
                    type="text"
                    className="w-full h-10 px-3 border border-slate-300 rounded-md"
                    value={config.s3.bucket}
                    onChange={(e) => handleChange('s3', 'bucket', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prefix</label>
                  <input
                    type="text"
                    className="w-full h-10 px-3 border border-slate-300 rounded-md"
                    value={config.s3.prefix}
                    onChange={(e) => handleChange('s3', 'prefix', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Authentication Mode</label>
                  <select
                    className="w-full h-10 px-3 border border-slate-300 rounded-md"
                    value={config.s3.authMode}
                    onChange={(e) => handleChange('s3', 'authMode', e.target.value)}
                  >
                    <option value="default">Default Credentials / IAM Role</option>
                    <option value="access_key">Access Key</option>
                  </select>
                </div>
              </div>

              {config.s3.authMode === 'access_key' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Access Key ID</label>
                    <input
                      type="text"
                      className="w-full h-10 px-3 border border-slate-300 rounded-md"
                      value={config.s3.accessKeyId}
                      onChange={(e) => handleChange('s3', 'accessKeyId', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Secret Access Key
                      {config.s3.secretConfigured && <span className="ml-2 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Secret Saved</span>}
                    </label>
                    <input
                      type="password"
                      className="w-full h-10 px-3 border border-slate-300 rounded-md"
                      value={config.s3.secretAccessKey}
                      onChange={(e) => handleChange('s3', 'secretAccessKey', e.target.value)}
                      placeholder={config.s3.secretConfigured ? "Leave blank to keep existing secret" : ""}
                    />
                  </div>
                </div>
              )}
            </Card>
          )}

          <div className="flex items-center justify-between mt-6">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                onClick={handleTest} 
                disabled={testing}
                className="gap-2"
              >
                <RefreshCw size={16} className={testing ? "animate-spin" : ""} />
                Test Connection
              </Button>
              {testResult && (
                <span className={`text-sm ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                  {testResult.message}
                </span>
              )}
            </div>

            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="bg-violet-600 text-white hover:bg-violet-700 gap-2 px-6"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
