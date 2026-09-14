import React, { useState, useMemo, useCallback } from 'react';
import {
  X, Download, FileSpreadsheet, FileText, FileCode, Printer,
  Check, CheckCircle2, ShieldCheck, Sliders, RefreshCw, Eye
} from 'lucide-react';
import './AuditExportModal.css';

export interface AuditEntryForExport {
  id: number;
  action: string;
  module: string;
  description: string;
  performedBy: string;
  referenceId: string;
  ipAddress: string;
  timestamp: string;
}

interface AuditExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: AuditEntryForExport[];
  totalLogsCount: number;
  activeFilterSummary: string;
  currentUser?: string;
}

type ExportFormat = 'excel' | 'pdf';

interface ColumnConfig {
  id: string;
  label: string;
  enabled: boolean;
}

export const AuditExportModal: React.FC<AuditExportModalProps> = ({
  isOpen,
  onClose,
  data,
  totalLogsCount,
  activeFilterSummary,
  currentUser = 'System Administrator',
}) => {
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [includeHeader, setIncludeHeader] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [successToast, setSuccessToast] = useState(false);

  const [columns, setColumns] = useState<ColumnConfig[]>([
    { id: 'id', label: 'Log ID', enabled: true },
    { id: 'action', label: 'Action Type', enabled: true },
    { id: 'module', label: 'System Module', enabled: true },
    { id: 'description', label: 'Activity Details', enabled: true },
    { id: 'performedBy', label: 'Performed By', enabled: true },
    { id: 'referenceId', label: 'Reference ID', enabled: true },
    { id: 'ipAddress', label: 'IP Address', enabled: true },
    { id: 'timestamp', label: 'Formatted Date/Time', enabled: true },
    { id: 'rawTimestamp', label: 'Raw UTC Timestamp', enabled: false },
  ]);

  const toggleColumn = (id: string) => {
    setColumns(prev =>
      prev.map(c => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  };

  const activeColumns = useMemo(() => columns.filter(c => c.enabled), [columns]);

  const formatDateTime = useCallback((ts: string) => {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }, []);

  const generateExcelHTML = useCallback(() => {
    const now = new Date();
    const exportTime = `${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    const colCount = activeColumns.length;

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>Audit Trail Logs</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 11pt; color: #1e293b; }
    table { border-collapse: collapse; width: 100%; }
    .banner { background-color: #0f172a; color: #ffffff; font-size: 14pt; font-weight: bold; padding: 12px; text-align: left; }
    .meta-title { font-weight: bold; background-color: #f1f5f9; color: #334155; padding: 6px 10px; border: 1px solid #cbd5e1; width: 150px; }
    .meta-val { background-color: #ffffff; color: #0f172a; padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 600; }
    .th-header { background-color: #0f172a; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #334155; text-align: left; text-transform: uppercase; font-size: 10pt; }
    .td-cell { padding: 8px 10px; border: 1px solid #e2e8f0; vertical-align: middle; font-size: 10pt; }
    .row-even { background-color: #ffffff; }
    .row-odd { background-color: #f8fafc; }
    .badge-action { font-weight: bold; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; display: inline-block; font-size: 9pt; }
    .act-approve { color: #16a34a; background-color: #dcfce7; }
    .act-create  { color: #059669; background-color: #d1fae5; }
    .act-update  { color: #2563eb; background-color: #dbeafe; }
    .act-delete  { color: #dc2626; background-color: #fee2e2; }
    .act-reject  { color: #b91c1c; background-color: #ffe4e6; }
    .act-login   { color: #7c3aed; background-color: #f3e8ff; }
    .act-export  { color: #d97706; background-color: #fef3c7; }
  </style>
</head>
<body>
  <table>
    <tbody>
    ${includeHeader ? `
    <tr>
      <td colspan="${colCount}" class="banner">
        PROCNEX ENTERPRISE PLATFORM — AUDIT TRAIL REPORT
      </td>
    </tr>
    <tr>
      <td class="meta-title">Generated On:</td>
      <td colspan="${colCount - 1}" class="meta-val">${exportTime}</td>
    </tr>
    <tr>
      <td class="meta-title">Exported By:</td>
      <td colspan="${colCount - 1}" class="meta-val">${currentUser}</td>
    </tr>
    <tr>
      <td class="meta-title">Total Records:</td>
      <td colspan="${colCount - 1}" class="meta-val">${data.length.toLocaleString()} Entries</td>
    </tr>
    <tr>
      <td class="meta-title">Filter Scope:</td>
      <td colspan="${colCount - 1}" class="meta-val">${activeFilterSummary || 'All System Logs'}</td>
    </tr>
    <tr><td colspan="${colCount}" style="height: 10px; background-color: #ffffff; border: none;"></td></tr>
    ` : ''}
    <tr>
      ${activeColumns.map(c => `<th class="th-header">${c.label}</th>`).join('')}
    </tr>`;

    data.forEach((row, idx) => {
      const rowClass = idx % 2 === 0 ? 'row-even' : 'row-odd';
      html += `<tr class="${rowClass}">`;
      activeColumns.forEach(col => {
        let val = '';
        switch (col.id) {
          case 'id': val = `#${row.id}`; break;
          case 'action':
            const actCls = row.action.toLowerCase();
            val = `<span class="badge-action act-${actCls}">${row.action}</span>`;
            break;
          case 'module': val = `<b>${row.module}</b>`; break;
          case 'description': val = row.description; break;
          case 'performedBy': val = row.performedBy; break;
          case 'referenceId': val = row.referenceId !== '-' ? `<code>${row.referenceId}</code>` : '—'; break;
          case 'ipAddress': val = `<span style="color:#64748b; font-family:monospace;">${row.ipAddress}</span>`; break;
          case 'timestamp': val = formatDateTime(row.timestamp); break;
          case 'rawTimestamp': val = row.timestamp; break;
          default: val = '';
        }
        html += `<td class="td-cell">${val}</td>`;
      });
      html += `</tr>`;
    });

    html += `
    </tbody>
  </table>
</body>
</html>`;

    return html;
  }, [data, currentUser, activeFilterSummary, activeColumns, formatDateTime, includeHeader]);

  const handleExecuteExport = () => {
    if (data.length === 0) return;
    setIsGenerating(true);
    setProgress(10);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 25;
      });
    }, 120);

    setTimeout(() => {
      setProgress(100);
      setTimeout(() => {
        setIsGenerating(false);
        setSuccessToast(true);

        const dateStr = new Date().toISOString().slice(0, 10);

        if (format === 'excel') {
          const excelHtml = generateExcelHTML();
          const blob = new Blob([excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
          const filename = `audit_trail_report_${dateStr}.xls`;

          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          // Printable PDF View window
          const printWin = window.open('', '_blank');
          if (printWin) {
            printWin.document.write(generateExcelHTML());
            printWin.document.close();
            setTimeout(() => {
              printWin.print();
            }, 300);
          }
        }

        setTimeout(() => setSuccessToast(false), 4500);
      }, 300);
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="audit-export-backdrop" onClick={onClose}>
      <div className="audit-export-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="audit-export-header">
          <div className="audit-export-header__title-wrap">
            <div className="audit-export-header__icon">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 className="audit-export-header__title">Export Audit Trail Report</h2>
              <p className="audit-export-header__sub">
                Download formatted Excel spreadsheet or printable PDF report
              </p>
            </div>
          </div>
          <button className="audit-export-modal__close" onClick={onClose} title="Close export modal">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="audit-export-body">
          {/* Format Selector Cards */}
          <div className="audit-export-section">
            <label className="audit-export-label">
              <FileSpreadsheet size={14} /> Select Export Format
            </label>
            <div className="audit-format-grid">
              {[
                {
                  id: 'excel' as ExportFormat,
                  name: 'Excel Workbook',
                  ext: '.xls / .xlsx',
                  icon: <FileSpreadsheet size={24} />,
                  badge: 'Recommended',
                  desc: 'Styled dark headers, action status chips & metadata report summary',
                },
                {
                  id: 'pdf' as ExportFormat,
                  name: 'PDF Audit Document',
                  ext: '.pdf',
                  icon: <Printer size={24} />,
                  badge: 'Compliance',
                  desc: 'High-resolution printable PDF audit report layout',
                },
              ].map(item => (
                <div
                  key={item.id}
                  className={`audit-format-card ${format === item.id ? 'audit-format-card--active' : ''}`}
                  onClick={() => setFormat(item.id)}
                >
                  <div className="audit-format-card__top">
                    <div className="audit-format-card__icon">{item.icon}</div>
                    <span className="audit-format-card__badge">{item.badge}</span>
                  </div>
                  <div className="audit-format-card__title">
                    {item.name} <span className="audit-format-card__ext">{item.ext}</span>
                  </div>
                  <p className="audit-format-card__desc">{item.desc}</p>
                  {format === item.id && (
                    <div className="audit-format-card__check">
                      <Check size={12} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Column Customization */}
          <div className="audit-export-section">
            <div className="audit-export-section__header">
              <label className="audit-export-label">
                <Sliders size={14} /> Included Fields ({activeColumns.length} of {columns.length})
              </label>
              <button
                type="button"
                className="audit-export-toggle-all"
                onClick={() => {
                  const allActive = columns.every(c => c.enabled);
                  setColumns(prev => prev.map(c => ({ ...c, enabled: !allActive })));
                }}
              >
                {columns.every(c => c.enabled) ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="audit-columns-chips">
              {columns.map(col => (
                <button
                  key={col.id}
                  type="button"
                  className={`audit-col-chip ${col.enabled ? 'audit-col-chip--active' : ''}`}
                  onClick={() => toggleColumn(col.id)}
                >
                  <span className="audit-col-chip__check">
                    {col.enabled ? <Check size={12} /> : null}
                  </span>
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          {/* Advanced Export Toggles */}
          <div className="audit-export-section">
            <label className="audit-export-label">
              <ShieldCheck size={14} /> Report Enhancements & Metadata Settings
            </label>
            <div className="audit-options-list">
              <label className="audit-option-row">
                <div className="audit-option-row__info">
                  <span className="audit-option-row__title">Executive Summary Banner</span>
                  <span className="audit-option-row__sub">
                    Include Procnex header with export date, operator name & active filter parameters
                  </span>
                </div>
                <input
                  type="checkbox"
                  className="audit-option-checkbox"
                  checked={includeHeader}
                  onChange={e => setIncludeHeader(e.target.checked)}
                />
              </label>
            </div>
          </div>

          {/* Live Data Preview Box */}
          <div className="audit-export-section">
            <label className="audit-export-label">
              <Eye size={14} /> Live Export Preview (Top 2 Entries)
            </label>
            <div className="audit-preview-box">
              {data.slice(0, 2).map((entry, idx) => (
                <div key={entry.id || idx} className="audit-preview-item">
                  <div className="audit-preview-item__top">
                    <span className={`audit-preview-badge audit-preview-badge--${entry.action.toLowerCase()}`}>
                      {entry.action}
                    </span>
                    <span className="audit-preview-module">{entry.module}</span>
                    <span className="audit-preview-user">by {entry.performedBy}</span>
                  </div>
                  <p className="audit-preview-desc">{entry.description}</p>
                </div>
              ))}
              {data.length > 2 && (
                <div className="audit-preview-footer">
                  + { (data.length - 2).toLocaleString() } more entries ready for export
                </div>
              )}
            </div>
          </div>

          {/* Export Progress Bar when generating */}
          {isGenerating && (
            <div className="audit-export-progress-wrap">
              <div className="audit-export-progress-info">
                <span>Generating {format.toUpperCase()} File...</span>
                <span>{progress}%</span>
              </div>
              <div className="audit-export-progress-bar">
                <div
                  className="audit-export-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Toast feedback */}
          {successToast && (
            <div className="audit-export-toast">
              <CheckCircle2 size={18} className="audit-export-toast__icon" />
              <span>Audit log file exported successfully! ({data.length.toLocaleString()} records)</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="audit-export-footer">
          <div className="audit-export-footer__info">
            <span className="audit-export-footer__count">
              {data.length.toLocaleString()} logs selected
            </span>
            {activeFilterSummary && (
              <span className="audit-export-footer__scope">
                ({activeFilterSummary})
              </span>
            )}
          </div>
          <div className="audit-export-footer__btns">
            <button type="button" className="audit-export-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="audit-export-btn-confirm"
              onClick={handleExecuteExport}
              disabled={isGenerating || activeColumns.length === 0}
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={16} className="spin-icon" /> Generating...
                </>
              ) : (
                <>
                  <Download size={16} /> Download {format.toUpperCase()} File
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
