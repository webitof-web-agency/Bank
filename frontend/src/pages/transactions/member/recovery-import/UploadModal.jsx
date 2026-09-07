import { useState, useRef } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Select } from '../../../../components/ui/Select';
import { api } from '../../../../api/api';

/**
 * UploadModal
 *
 * Step 1 — File selected → POST /analyze → server detects legacy template
 *   Legacy detected  → auto-map preview shown, user can confirm or switch to manual
 *   Not detected     → manual column mapper shown
 *
 * Step 2 — User confirms colMap → POST /upload
 */
export default function UploadModal({ isOpen, onClose, onUploadSuccess, token }) {
  const [file, setFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [isLegacy, setIsLegacy] = useState(false);
  const [headers, setHeaders] = useState([]);
  const [colMap, setColMap] = useState({ pfNo: '', amount: '' });
  const [manualMode, setManualMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef();

  // --- Step 1: analyze on file select ---
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setAnalyzed(false);
    setIsLegacy(false);
    setHeaders([]);
    setColMap({ pfNo: '', amount: '' });
    setManualMode(false);
    setError(null);
    setAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await api.recoveryImport.analyze(token, formData);

      if (res.success) {
        const { headers: hdrs, isLegacy: legacy, colMap: detected } = res.data;
        setHeaders(hdrs || []);
        setIsLegacy(!!legacy);

        if (legacy && detected) {
          // Auto-map from legacy detection; colMap contains raw string header names
          setColMap({
            pfNo: detected.pfNo || '',
            amount: detected.amount || '',
            branch: detected.branch || '',
            empName: detected.empName || '',
            grade: detected.grade || ''
          });
          setManualMode(false);
        } else {
          // Fall through to manual mapping
          setManualMode(true);
          // Try simple auto-guess for manual mode
          const map = { pfNo: '', amount: '' };
          (hdrs || []).forEach((h, i) => {
            const lower = String(h || '').toLowerCase();
            if (lower.includes('pf') && !map.pfNo) map.pfNo = String(i);
            if ((lower.includes('amount') || lower.includes('total') || lower.includes('recovery')) && !map.amount) map.amount = String(i);
          });
          setColMap(map);
        }
        setAnalyzed(true);
      } else {
        setError(res.error || 'Could not read file headers');
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze file');
    } finally {
      setAnalyzing(false);
    }
  };

  // --- Step 2: upload ---
  const handleUpload = async () => {
    if (!file) return;

    // Validate required fields
    if (!colMap.pfNo || !colMap.amount) {
      setError('PF No. and Total Amount column must be selected.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // If legacy (name-based) map, send as-is (string header names)
      // If manual (index-based), convert to integer indices
      let finalColMap;
      if (isLegacy && !manualMode) {
        finalColMap = {
          pfNo: colMap.pfNo,
          amount: colMap.amount,
          branch: colMap.branch || undefined,
          empName: colMap.empName || undefined,
          grade: colMap.grade || undefined
        };
      } else {
        finalColMap = {
          pfNo: parseInt(colMap.pfNo),
          amount: parseInt(colMap.amount)
        };
      }

      formData.append('colMap', JSON.stringify(finalColMap));
      const response = await api.recoveryImport.upload(token, formData);
      if (response.success) {
        onUploadSuccess(response.data);
        resetAndClose();
      } else {
        setError(response.error || 'Upload failed');
      }
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setFile(null);
    setAnalyzed(false);
    setIsLegacy(false);
    setHeaders([]);
    setColMap({ pfNo: '', amount: '' });
    setManualMode(false);
    setError(null);
    onClose();
  };

  const headerOptions = headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }));

  const canUpload = analyzed && colMap.pfNo && colMap.amount && !analyzing;

  return (
    <Modal
      open={isOpen}
      onClose={resetAndClose}
      title="Import Recovery Excel / CSV"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="outline" onClick={resetAndClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!canUpload || loading}>
            {loading ? 'Importing…' : 'Import'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
          {/* File picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select File (.xlsx, .xls, .csv)</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
            />
          </div>

          {/* Analyzing spinner */}
          {analyzing && (
            <p className="text-sm text-muted-foreground animate-pulse">Detecting file format…</p>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}

          {/* Legacy auto-detected banner */}
          {analyzed && isLegacy && !manualMode && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-green-800">✓ Legacy "Divide Demand" format detected</p>
              <p className="text-xs text-green-700">Columns auto-mapped from standard legacy headers:</p>
              <div className="grid grid-cols-2 gap-1 text-xs text-green-900">
                <span className="font-medium">PF No. →</span><span className="font-mono">{colMap.pfNo}</span>
                <span className="font-medium">Total Amt. →</span><span className="font-mono">{colMap.amount}</span>
                {colMap.branch && <><span className="font-medium">Branch →</span><span className="font-mono">{colMap.branch}</span></>}
                {colMap.empName && <><span className="font-medium">Emp. Name →</span><span className="font-mono">{colMap.empName}</span></>}
                {colMap.grade && <><span className="font-medium">Grade →</span><span className="font-mono">{colMap.grade}</span></>}
              </div>
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="text-xs text-green-700 underline hover:no-underline"
              >
                Override — select columns manually
              </button>
            </div>
          )}

          {/* Non-legacy warning */}
          {analyzed && !isLegacy && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-800">Custom format — please map columns manually</p>
              <p className="text-xs text-amber-700 mt-1">The file does not match the standard legacy headers. Select the correct columns below.</p>
            </div>
          )}

          {/* Manual column mapper */}
          {analyzed && manualMode && (
            <div className="space-y-3 border rounded-md p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Map Columns</h4>
                {isLegacy && (
                  <button
                    type="button"
                    onClick={() => setManualMode(false)}
                    className="text-xs text-primary underline hover:no-underline"
                  >
                    ← Use auto-detected mapping
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm">PF No. Column <span className="text-red-500">*</span></label>
                <Select
                  value={colMap.pfNo}
                  onChange={v => setColMap(prev => ({ ...prev, pfNo: v }))}
                  placeholder="Select PF No column"
                  options={headerOptions}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm">Total Recovery Amount Column <span className="text-red-500">*</span></label>
                <Select
                  value={colMap.amount}
                  onChange={v => setColMap(prev => ({ ...prev, amount: v }))}
                  placeholder="Select Amount column"
                  options={headerOptions}
                />
              </div>
            </div>
          )}
      </div>
    </Modal>
  );
}
