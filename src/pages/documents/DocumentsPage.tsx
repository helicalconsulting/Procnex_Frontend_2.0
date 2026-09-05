import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { localDataService, type DocumentItem as ServiceDocument } from '../../services/localDataService';
import {
  FolderOpen,
  Search,
  Upload,
  Eye,
  Download,
  Trash2,
  X,
  FileText,
  FileSpreadsheet,
  FileImage,
  FilePlus,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  LayoutGrid,
  HardDrive,
  Files,
  Clock,
  Link2,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import './DocumentsPage.css';

// ─── Types ──────────────────────────────────────────────────

type DocType = 'PDF' | 'XLSX' | 'DOCX' | 'PNG' | 'JPG' | 'CSV';
type DocCategory = 'RFQ' | 'Purchase Order' | 'Quotation' | 'Invoice' | 'Contract' | 'Compliance' | 'Other';

interface MockDocument {
  id: number;
  fileName: string;
  fileType: DocType;
  fileSize: string;
  category: DocCategory;
  linkedRef: string;
  uploadedBy: string;
  uploadedByInitials: string;
  avatarMod: string;
  uploadedAt: string;
  description: string;
}

// ─── Helpers ────────────────────────────────────────────────

const FILE_ICONS: Record<DocType, React.ReactNode> = {
  PDF: <FileText size={18} />,
  XLSX: <FileSpreadsheet size={18} />,
  DOCX: <FileText size={18} />,
  PNG: <FileImage size={18} />,
  JPG: <FileImage size={18} />,
  CSV: <FileSpreadsheet size={18} />,
};

const FILE_COLORS: Record<DocType, string> = {
  PDF: 'pdf', XLSX: 'xlsx', DOCX: 'docx', PNG: 'img', JPG: 'img', CSV: 'csv',
};

const CATEGORIES: DocCategory[] = ['RFQ', 'Purchase Order', 'Quotation', 'Invoice', 'Contract', 'Compliance', 'Other'];

function extToDocType(name: string): DocType {
  const ext = name.split('.').pop()?.toUpperCase() || 'PDF';
  if (ext === 'XLS' || ext === 'XLSX') return 'XLSX';
  if (ext === 'DOC' || ext === 'DOCX') return 'DOCX';
  if (ext === 'PNG') return 'PNG';
  if (ext === 'JPG' || ext === 'JPEG') return 'JPG';
  if (ext === 'CSV') return 'CSV';
  return 'PDF';
}

const MODULE_TO_CATEGORY: Record<string, DocCategory> = {
  RFQ: 'RFQ',
  PO: 'Purchase Order',
  QUOTATION: 'Quotation',
};

function mapDocument(d: ServiceDocument): MockDocument {
  const initials = d.uploadedBy.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return {
    id: d.id,
    fileName: d.name,
    fileType: extToDocType(d.name),
    fileSize: d.size,
    category: MODULE_TO_CATEGORY[d.module.toUpperCase()] || 'Other',
    linkedRef: d.module,
    uploadedBy: d.uploadedBy,
    uploadedByInitials: initials,
    avatarMod: String((d.id % 6) + 1),
    uploadedAt: `${d.uploadedAt}T12:00:00`,
    description: d.name,
  };
}

// ─── Component ──────────────────────────────────────────────

export default function DocumentsPage() {
  const { hasPermission } = useAuth();
  const canUpload = hasPermission('Company Settings', 'canCreate') || hasPermission('RFQ Management', 'canCreate');
  const { data: docs, loading, error } = useServiceData(
    () => localDataService.getDocuments().then((list) => list.map(mapDocument)),
    [] as MockDocument[]
  );

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<'ALL' | DocCategory>('ALL');
  const [view, setView] = useState<'table' | 'card'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const [detailDoc, setDetailDoc] = useState<MockDocument | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  useBodyScrollLock(!!(showUpload || detailDoc));
  const perPage = 8;

  // Upload form
  const [upName, setUpName] = useState('');
  const [upCategory, setUpCategory] = useState<DocCategory | ''>('');
  const [upRef, setUpRef] = useState('');
  const [upDesc, setUpDesc] = useState('');

  const summary = useMemo(() => ({
    total: docs.length,
    categories: new Set(docs.map(d => d.category)).size,
    recent: docs.filter(d => {
      const diff = Date.now() - new Date(d.uploadedAt).getTime();
      return diff < 7 * 24 * 60 * 60 * 1000;
    }).length,
    totalSize: '16.6 MB',
  }), [docs]);

  const catCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: docs.length };
    for (const d of docs) c[d.category] = (c[d.category] || 0) + 1;
    return c;
  }, [docs]);

  const filtered = useMemo(() => {
    let list = docs;
    if (catFilter !== 'ALL') list = list.filter(d => d.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.fileName.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) ||
        d.linkedRef.toLowerCase().includes(q) || d.uploadedBy.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [docs, catFilter, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const openUpload = useCallback(() => {
    setUpName(''); setUpCategory(''); setUpRef(''); setUpDesc('');
    setShowUpload(true);
  }, []);

  const formatDateTime = (d: string) => {
    const date = new Date(d);
    return `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="docs-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {/* Header */}
      <div className="docs-page__header">
        <div className="docs-page__header-left">
          <h1>Documents</h1>
          <p>Upload, manage, and access all procurement documents in one place</p>
        </div>
        <button
          className="docs-page__upload-btn"
          onClick={canUpload ? openUpload : undefined}
          disabled={!canUpload}
          style={!canUpload ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
          title={!canUpload ? "Admin has not allowed this action. You do not have permission to upload documents." : undefined}
        >
          <Upload size={18} /> Upload Document
        </button>
      </div>

      {/* Summary */}
      <div className="docs-summary">
        {[
          { icon: <Files size={22} />, val: summary.total, label: 'Total Files', cls: 'total' },
          { icon: <FolderOpen size={22} />, val: summary.categories, label: 'Categories', cls: 'cats' },
          { icon: <Clock size={22} />, val: summary.recent, label: 'This Week', cls: 'recent' },
          { icon: <HardDrive size={22} />, val: summary.totalSize, label: 'Total Size', cls: 'size' },
        ].map(c => (
          <div key={c.cls} className="docs-summary-card">
            <div className={`docs-summary-card__icon docs-summary-card__icon--${c.cls}`}>{c.icon}</div>
            <div className="docs-summary-card__info">
              <span className="docs-summary-card__value">{c.val}</span>
              <span className="docs-summary-card__label">{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Category Pills */}
      <div className="docs-pills">
        <button className={`docs-pill ${catFilter === 'ALL' ? 'docs-pill--active' : ''}`}
          onClick={() => { setCatFilter('ALL'); setCurrentPage(1); }}>
          All <span className="docs-pill__count">{catCounts['ALL']}</span>
        </button>
        {CATEGORIES.map(c => (catCounts[c] || 0) > 0 && (
          <button key={c} className={`docs-pill ${catFilter === c ? 'docs-pill--active' : ''}`}
            onClick={() => { setCatFilter(c); setCurrentPage(1); }}>
            {c} <span className="docs-pill__count">{catCounts[c]}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="docs-toolbar">
        <div className="docs-toolbar__search">
          <Search size={16} className="docs-toolbar__search-icon" />
          <input type="text" placeholder="Search by file name, category, reference, or uploader..."
            value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
        </div>
        <div className="docs-toolbar__right">
          <div className="docs-toolbar__view-toggle">
            <button className={`docs-toolbar__view-btn ${view === 'table' ? 'docs-toolbar__view-btn--active' : ''}`}
              onClick={() => setView('table')}><LayoutList size={16} /></button>
            <button className={`docs-toolbar__view-btn ${view === 'card' ? 'docs-toolbar__view-btn--active' : ''}`}
              onClick={() => setView('card')}><LayoutGrid size={16} /></button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="docs-table-card">
          <TableSkeleton rows={4} columns={5} />
        </div>
      ) : paginated.length > 0 ? (
        view === 'table' ? (
          <div className="docs-table-card">
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead><tr>
                  <th>File</th><th>Category</th><th>Reference</th><th>Size</th><th>Uploaded By</th><th>Date</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {paginated.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <div className="docs-table__file">
                          <div className={`docs-table__file-icon docs-table__file-icon--${FILE_COLORS[doc.fileType]}`}>
                            {FILE_ICONS[doc.fileType]}
                          </div>
                          <div className="docs-table__file-info">
                            <span className="docs-table__file-name">{doc.fileName}</span>
                            <span className="docs-table__file-desc">{doc.description}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className="docs-cat-badge">{doc.category}</span></td>
                      <td><span className="docs-table__ref">{doc.linkedRef !== '-' ? doc.linkedRef : '—'}</span></td>
                      <td className="docs-table__size">{doc.fileSize}</td>
                      <td>
                        <div className="docs-table__uploader">
                          <div className={`docs-table__avatar docs-table__avatar--${doc.avatarMod}`}>{doc.uploadedByInitials}</div>
                          <span>{doc.uploadedBy}</span>
                        </div>
                      </td>
                      <td className="docs-table__date">{formatDate(doc.uploadedAt)}</td>
                      <td>
                        <div className="docs-table__actions">
                          <button className="docs-table__action-btn" title="View" onClick={() => setDetailDoc(doc)}><Eye size={15} /></button>
                          <button className="docs-table__action-btn" title="Download"><Download size={15} /></button>
                          <button
                            className="docs-table__action-btn docs-table__action-btn--danger"
                            disabled={!canUpload}
                            style={!canUpload ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                            title={!canUpload ? "Admin has not allowed this action. You do not have permission to delete documents." : "Delete"}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > perPage && (
              <div className="docs-pagination">
                <span className="docs-pagination__info">Showing {(currentPage-1)*perPage+1}–{Math.min(currentPage*perPage, filtered.length)} of {filtered.length}</span>
                <div className="docs-pagination__btns">
                  <button className="docs-pagination__btn" disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)}><ChevronLeft size={14} /></button>
                  {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                    <button key={p} className={`docs-pagination__btn ${currentPage===p?'docs-pagination__btn--active':''}`} onClick={()=>setCurrentPage(p)}>{p}</button>
                  ))}
                  <button className="docs-pagination__btn" disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>p+1)}><ChevronRight size={14} /></button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="docs-cards">
            {paginated.map(doc => (
              <div key={doc.id} className="docs-card" onClick={() => setDetailDoc(doc)}>
                <div className="docs-card__top">
                  <div className={`docs-card__icon docs-table__file-icon--${FILE_COLORS[doc.fileType]}`}>{FILE_ICONS[doc.fileType]}</div>
                  <span className="docs-card__type">{doc.fileType}</span>
                </div>
                <div className="docs-card__name">{doc.fileName}</div>
                <div className="docs-card__desc">{doc.description}</div>
                <div className="docs-card__meta">
                  <span className="docs-cat-badge">{doc.category}</span>
                  <span className="docs-card__size">{doc.fileSize}</span>
                </div>
                <div className="docs-card__footer">
                  <div className="docs-card__uploader"><div className={`docs-table__avatar docs-table__avatar--${doc.avatarMod}`}>{doc.uploadedByInitials}</div><span>{doc.uploadedBy}</span></div>
                  <span className="docs-card__date">{formatDate(doc.uploadedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="docs-table-card"><div className="docs-empty">
          <div className="docs-empty__icon"><FolderOpen size={48} /></div>
          <div className="docs-empty__title">No documents found</div>
          <div className="docs-empty__desc">{search ? 'Try adjusting your search.' : 'Upload your first document to get started.'}</div>
        </div></div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="docs-modal-backdrop" onClick={() => setShowUpload(false)}>
          <div className="docs-modal" onClick={e => e.stopPropagation()}>
            <div className="docs-modal__header">
              <span className="docs-modal__title"><FilePlus size={20} /> Upload Document</span>
              <button className="docs-modal__close" onClick={() => setShowUpload(false)}><X size={18} /></button>
            </div>
            <div className="docs-modal__body">
              <div className="docs-upload-zone">
                <Upload size={32} />
                <span className="docs-upload-zone__text">Drag & drop files here or click to browse</span>
                <span className="docs-upload-zone__hint">PDF, XLSX, DOCX, PNG, JPG, CSV — Max 10 MB</span>
              </div>
              <div className="docs-modal__field">
                <label className="docs-modal__label">File Name <span>*</span></label>
                <input className="docs-modal__input" placeholder="e.g. RFQ-2024-021_TechSpecs.pdf" value={upName} onChange={e => setUpName(e.target.value)} />
              </div>
              <div className="docs-modal__row">
                <div className="docs-modal__field">
                  <label className="docs-modal__label">Category</label>
                  <select className="docs-modal__select" value={upCategory} onChange={e => setUpCategory(e.target.value as DocCategory | '')}>
                    <option value="">Select category</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="docs-modal__field">
                  <label className="docs-modal__label"><Link2 size={13} style={{marginRight:4}} /> Linked Reference</label>
                  <input className="docs-modal__input" placeholder="e.g. RFQ-2024-021" value={upRef} onChange={e => setUpRef(e.target.value)} />
                </div>
              </div>
              <div className="docs-modal__field">
                <label className="docs-modal__label">Description</label>
                <textarea className="docs-modal__textarea" rows={3} placeholder="Brief description of this document..."
                  value={upDesc} onChange={e => setUpDesc(e.target.value)} />
              </div>
            </div>
            <div className="docs-modal__footer">
              <button className="docs-modal__btn docs-modal__btn--secondary" onClick={() => setShowUpload(false)}>Cancel</button>
              <button className="docs-modal__btn docs-modal__btn--primary" disabled={!upName.trim()}>
                <Upload size={16} /> Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailDoc && (
        <div className="docs-modal-backdrop" onClick={() => setDetailDoc(null)}>
          <div className="docs-modal docs-modal--detail" onClick={e => e.stopPropagation()}>
            <div className="docs-modal__header">
              <span className="docs-modal__title"><Eye size={20} /> Document Details</span>
              <button className="docs-modal__close" onClick={() => setDetailDoc(null)}><X size={18} /></button>
            </div>
            <div className="docs-modal__body">
              <div className="docs-detail-file-row">
                <div className={`docs-detail-file-icon docs-table__file-icon--${FILE_COLORS[detailDoc.fileType]}`}>{FILE_ICONS[detailDoc.fileType]}</div>
                <div>
                  <div className="docs-detail-file-name">{detailDoc.fileName}</div>
                  <div className="docs-detail-file-meta">{detailDoc.fileType} · {detailDoc.fileSize}</div>
                </div>
              </div>
              <div className="docs-detail-grid">
                {[
                  { l: 'Category', v: detailDoc.category }, { l: 'Reference', v: detailDoc.linkedRef !== '-' ? detailDoc.linkedRef : '—' },
                  { l: 'Uploaded By', v: detailDoc.uploadedBy }, { l: 'Uploaded', v: formatDateTime(detailDoc.uploadedAt) },
                ].map(i => (
                  <div key={i.l} className="docs-detail-grid__item">
                    <span className="docs-detail-grid__label">{i.l}</span>
                    <span className="docs-detail-grid__value">{i.v}</span>
                  </div>
                ))}
              </div>
              <div className="docs-detail-desc">
                <span className="docs-detail-desc__label">Description</span>
                <p className="docs-detail-desc__text">{detailDoc.description}</p>
              </div>
            </div>
            <div className="docs-modal__footer">
              <button className="docs-modal__btn docs-modal__btn--secondary" onClick={() => setDetailDoc(null)}>Close</button>
              <button className="docs-modal__btn docs-modal__btn--primary"><Download size={16} /> Download</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
