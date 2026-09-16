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
import { PageFrame, PageLead, MetricCard, EmptyState } from '../../components/ui/product';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';

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

const FILE_TONES: Record<DocType, string> = {
  PDF: 'bg-rose-500/10 text-rose-600 ring-rose-500/15 dark:text-rose-300',
  XLSX: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-300',
  CSV: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-300',
  DOCX: 'bg-sky-500/10 text-sky-600 ring-sky-500/15 dark:text-sky-300',
  PNG: 'bg-violet-500/10 text-violet-600 ring-violet-500/15 dark:text-violet-300',
  JPG: 'bg-violet-500/10 text-violet-600 ring-violet-500/15 dark:text-violet-300',
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
    <PageFrame>
      {error && <MessageStrip type="error" className="mb-4">{error}</MessageStrip>}
      
      {/* Header */}
      <PageLead
        title="Documents"
        description="Upload, manage, and access all procurement documents in one place"
        actions={
          <Button
            onClick={canUpload ? openUpload : undefined}
            disabled={!canUpload}
            title={!canUpload ? "Admin has not allowed this action. You do not have permission to upload documents." : undefined}
          >
            <Upload className="mr-2 size-4" /> Upload Document
          </Button>
        }
      />

      {/* Metric Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Files} label="Total Files" value={summary.total} tone="primary" aria-pressed={true} />
        <MetricCard icon={FolderOpen} label="Categories" value={summary.categories} tone="violet" />
        <MetricCard icon={Clock} label="This Week" value={summary.recent} tone="cyan" />
        <MetricCard icon={HardDrive} label="Total Size" value={summary.totalSize} tone="success" />
      </div>

      {/* Category Pills */}
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-border/60 pb-4">
        <button
          onClick={() => { setCatFilter('ALL'); setCurrentPage(1); }}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
            catFilter === 'ALL'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          All
          <span className={cn('rounded-md px-1.5 py-0.5 text-[11px]', catFilter === 'ALL' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background/80 text-muted-foreground')}>
            {catCounts['ALL']}
          </span>
        </button>
        {CATEGORIES.map(c => (catCounts[c] || 0) > 0 && (
          <button
            key={c}
            onClick={() => { setCatFilter(c); setCurrentPage(1); }}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
              catFilter === c
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {c}
            <span className={cn('rounded-md px-1.5 py-0.5 text-[11px]', catFilter === c ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background/80 text-muted-foreground')}>
              {catCounts[c]}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by file name, category, reference, or uploader..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-9"
            />
          </div>
          <div className="flex items-center justify-end gap-1">
            <Button
              variant={view === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('table')}
              className="h-9 w-9 p-0"
              title="Table View"
            >
              <LayoutList className="size-4" />
            </Button>
            <Button
              variant={view === 'card' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('card')}
              className="h-9 w-9 p-0"
              title="Card View"
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Content */}
      {loading ? (
        <Card className="p-6">
          <TableSkeleton rows={4} columns={5} />
        </Card>
      ) : paginated.length > 0 ? (
        view === 'table' ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/40 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3.5">File</th>
                    <th className="px-5 py-3.5">Category</th>
                    <th className="px-5 py-3.5">Reference</th>
                    <th className="px-5 py-3.5">Size</th>
                    <th className="px-5 py-3.5">Uploaded By</th>
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paginated.map(doc => (
                    <tr key={doc.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={cn('grid size-9 shrink-0 place-items-center rounded-lg ring-1', FILE_TONES[doc.fileType])}>
                            {FILE_ICONS[doc.fileType]}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate max-w-[240px]">{doc.fileName}</div>
                            <div className="text-[12px] text-muted-foreground truncate max-w-[240px]">{doc.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant="outline" className="font-medium">{doc.category}</Badge>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[12px]">
                        {doc.linkedRef !== '-' ? doc.linkedRef : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground font-mono">{doc.fileSize}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="grid size-6 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {doc.uploadedByInitials}
                          </div>
                          <span className="text-foreground">{doc.uploadedBy}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{formatDate(doc.uploadedAt)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View" onClick={() => setDetailDoc(doc)}>
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Download">
                            <Download className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            disabled={!canUpload}
                            title={!canUpload ? "Admin has not allowed this action." : "Delete"}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length > perPage && (
              <div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
                <span>Showing {(currentPage-1)*perPage+1}–{Math.min(currentPage*perPage, filtered.length)} of {filtered.length}</span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)} className="h-8 w-8 p-0">
                    <ChevronLeft className="size-4" />
                  </Button>
                  {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                    <Button
                      key={p}
                      variant={currentPage===p?'default':'outline'}
                      size="sm"
                      onClick={()=>setCurrentPage(p)}
                      className="h-8 w-8 p-0"
                    >
                      {p}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>p+1)} className="h-8 w-8 p-0">
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginated.map(doc => (
              <Card
                key={doc.id}
                className="group cursor-pointer p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                onClick={() => setDetailDoc(doc)}
              >
                <div className="flex items-center justify-between">
                  <div className={cn('grid size-10 place-items-center rounded-xl ring-1', FILE_TONES[doc.fileType])}>
                    {FILE_ICONS[doc.fileType]}
                  </div>
                  <Badge variant="secondary" className="text-[11px] font-semibold">{doc.fileType}</Badge>
                </div>
                <h3 className="mt-3 truncate text-sm font-semibold text-foreground group-hover:text-primary">{doc.fileName}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground min-h-[32px]">{doc.description}</p>
                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3 text-xs">
                  <Badge variant="outline" className="text-[11px]">{doc.category}</Badge>
                  <span className="font-mono text-[12px] text-muted-foreground">{doc.fileSize}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="grid size-5 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                      {doc.uploadedByInitials}
                    </div>
                    <span className="truncate max-w-[90px]">{doc.uploadedBy}</span>
                  </div>
                  <span>{formatDate(doc.uploadedAt)}</span>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        <EmptyState
          icon={FolderOpen}
          title="No documents found"
          description={search ? 'Try adjusting your search filters.' : 'Upload your first document to get started.'}
          action={
            canUpload ? (
              <Button onClick={openUpload}>
                <Upload className="mr-2 size-4" /> Upload Document
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="size-5 text-primary" /> Upload Document
            </DialogTitle>
            <DialogDescription>
              Select and attach files to your procurement repository.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="border-2 border-dashed border-border/80 hover:border-primary/50 transition-colors rounded-xl p-6 text-center cursor-pointer bg-muted/20">
              <Upload className="mx-auto size-8 text-muted-foreground mb-2" />
              <div className="text-sm font-semibold text-foreground">Drag & drop files here or click to browse</div>
              <div className="text-xs text-muted-foreground mt-1">PDF, XLSX, DOCX, PNG, JPG, CSV — Max 10 MB</div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">File Name <span className="text-destructive">*</span></label>
              <Input
                placeholder="e.g. RFQ-2024-021_TechSpecs.pdf"
                value={upName}
                onChange={e => setUpName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Category</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={upCategory}
                  onChange={e => setUpCategory(e.target.value as DocCategory | '')}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Link2 className="size-3" /> Linked Reference
                </label>
                <Input
                  placeholder="e.g. RFQ-2024-021"
                  value={upRef}
                  onChange={e => setUpRef(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Description</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
                placeholder="Brief description of this document..."
                value={upDesc}
                onChange={e => setUpDesc(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
            <Button disabled={!upName.trim()} onClick={() => setShowUpload(false)}>
              <Upload className="mr-2 size-4" /> Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailDoc} onOpenChange={() => setDetailDoc(null)}>
        {detailDoc && (
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="size-5 text-primary" /> Document Details
              </DialogTitle>
              <DialogDescription>
                Overview of document metadata and link references.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl ring-1', FILE_TONES[detailDoc.fileType])}>
                  {FILE_ICONS[detailDoc.fileType]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground truncate">{detailDoc.fileName}</div>
                  <div className="text-xs text-muted-foreground">{detailDoc.fileType} · {detailDoc.fileSize}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">Category</div>
                  <div className="mt-1 font-semibold text-foreground">{detailDoc.category}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">Reference</div>
                  <div className="mt-1 font-semibold font-mono text-foreground">{detailDoc.linkedRef !== '-' ? detailDoc.linkedRef : '—'}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">Uploaded By</div>
                  <div className="mt-1 font-semibold text-foreground">{detailDoc.uploadedBy}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">Uploaded Date</div>
                  <div className="mt-1 font-semibold text-foreground">{formatDateTime(detailDoc.uploadedAt)}</div>
                </div>
              </div>

              <div className="rounded-lg border border-border/50 bg-card p-3 text-xs">
                <div className="text-muted-foreground">Description</div>
                <div className="mt-1 text-foreground leading-relaxed">{detailDoc.description || 'No description provided.'}</div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailDoc(null)}>Close</Button>
              <Button>
                <Download className="mr-2 size-4" /> Download
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageFrame>
  );
}
