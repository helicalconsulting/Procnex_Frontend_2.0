import { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  FileText,
  GripVertical,
  Type,
  AlignLeft,
  Hash,
  Mail,
  Phone,
  DollarSign,
  Calendar,
  Clock,
  ChevronDown,
  ListFilter,
  CheckSquare,
  CircleDot,
  UploadCloud,
  PenTool,
  Heading,
  Minus,
  UserCheck,
  Building,
  Layers,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { FIELD_PALETTE } from './paletteData';
import type { FormDefinition, FormField, FieldType } from '../../types/formBuilder';

const ICON_MAP: Record<string, React.ReactNode> = {
  Type: <Type size={16} />,
  AlignLeft: <AlignLeft size={16} />,
  Hash: <Hash size={16} />,
  Mail: <Mail size={16} />,
  Phone: <Phone size={16} />,
  DollarSign: <DollarSign size={16} />,
  Calendar: <Calendar size={16} />,
  Clock: <Clock size={16} />,
  ChevronDown: <ChevronDown size={16} />,
  ListFilter: <ListFilter size={16} />,
  CheckSquare: <CheckSquare size={16} />,
  CircleDot: <CircleDot size={16} />,
  UploadCloud: <UploadCloud size={16} />,
  PenTool: <PenTool size={16} />,
  Heading: <Heading size={16} />,
  FileText: <FileText size={16} />,
  Minus: <Minus size={16} />,
  UserCheck: <UserCheck size={16} />,
  Building: <Building size={16} />,
};

interface FormBuilderSidebarProps {
  forms: FormDefinition[];
  activeFormId: string | null;
  onSelectForm: (formId: string) => void;
  onCreateNewForm: () => void;
  onDeleteForm: (formId: string) => void;
  onAddField: (type: FieldType, defaultConfig: Partial<FormField>) => void;
  sidebarTab: 'palette' | 'forms';
  setSidebarTab: (tab: 'palette' | 'forms') => void;
}

export default function FormBuilderSidebar({
  forms,
  activeFormId,
  onSelectForm,
  onCreateNewForm,
  onDeleteForm,
  onAddField,
  sidebarTab,
  setSidebarTab,
}: FormBuilderSidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [paletteSearch, setPaletteSearch] = useState('');
  const [deletingForm, setDeletingForm] = useState<{ id: string; title: string } | null>(null);

  // Filter palette items based on search
  const filteredPalette = useMemo(() => {
    if (!paletteSearch.trim()) return FIELD_PALETTE;
    const query = paletteSearch.toLowerCase();
    return FIELD_PALETTE.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
      ),
    })).filter((cat) => cat.items.length > 0);
  }, [paletteSearch]);

  // Filter form list
  const filteredForms = useMemo(() => {
    if (!searchTerm.trim()) return forms;
    const q = searchTerm.toLowerCase();
    return forms.filter(
      (f) => f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
    );
  }, [forms, searchTerm]);

  const handleDragStart = (e: React.DragEvent, type: FieldType, defaultConfig: Partial<FormField>) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, defaultConfig }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="flex min-h-0 w-full flex-col border-b border-border/70 bg-card xl:w-72 xl:shrink-0 xl:border-b-0 xl:border-r 2xl:w-80">
      {/* Top Sidebar Header & View Switcher */}
      <div className="flex flex-col gap-2.5 border-b border-border/70 p-4">
        <div className="flex gap-1 rounded-xl border border-border bg-muted/50 p-1">
          <button
            type="button"
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${sidebarTab === 'palette' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setSidebarTab('palette')}
          >
            <Layers size={15} />
            Components
          </button>
          <button
            type="button"
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition ${sidebarTab === 'forms' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setSidebarTab('forms')}
          >
            <FileText size={15} />
            Form List ({forms.length})
          </button>
        </div>

        <button
          type="button"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 text-sm font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/15"
          onClick={onCreateNewForm}
          title="Create New Form"
        >
          <Plus size={16} />
          Create New Form
        </button>
      </div>

      {/* Tab Content: Components Palette */}
      {sidebarTab === 'palette' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative border-b border-border/70 p-3">
            <Search size={14} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search components..."
              value={paletteSearch}
              onChange={(e) => setPaletteSearch(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div className="flex max-h-80 flex-col gap-4 overflow-y-auto overscroll-contain p-4 xl:max-h-none xl:min-h-0 xl:flex-1">
            {filteredPalette.map((category) => (
              <div key={category.category} className="flex flex-col gap-2">
                <span className="px-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{category.category}</span>
                <div className="flex flex-col gap-2">
                  {category.items.map((item) => (
                    <button
                      type="button"
                      key={item.type}
                      className="group flex min-h-14 cursor-grab items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2 text-left transition hover:border-primary/40 hover:bg-primary/[0.03] active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => handleDragStart(e, item.type, item.defaultConfig)}
                      onClick={() => onAddField(item.type, item.defaultConfig)}
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {ICON_MAP[item.icon] || <Layers size={16} />}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-semibold text-foreground">{item.label}</span>
                        <span className="truncate text-[12px] text-muted-foreground">{item.description}</span>
                      </div>
                      <div className="text-muted-foreground/60 transition group-hover:text-muted-foreground" title="Drag onto canvas or click to add">
                        <GripVertical size={14} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content: Form List */}
      {sidebarTab === 'forms' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative border-b border-border/70 p-3">
            <Search size={14} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search saved forms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </div>

          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto p-4 xl:max-h-none xl:flex-1">
            {filteredForms.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center text-muted-foreground">
                <FileText size={32} />
                <p>No forms found</p>
                <button type="button" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground" onClick={onCreateNewForm}>
                  Create your first form
                </button>
              </div>
            ) : (
              filteredForms.map((form) => {
                const isActive = form.id === activeFormId;
                return (
                  <div
                    key={form.id}
                    className={`group relative flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition ${isActive ? 'border-primary bg-primary/[0.06]' : 'border-border bg-background hover:border-primary/40 hover:bg-primary/[0.03]'}`}
                    onClick={() => onSelectForm(form.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectForm(form.id); } }}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                      <FileText size={18} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs font-semibold text-foreground">{form.title || 'Untitled Form'}</span>
                      <span className="text-[12px] capitalize text-muted-foreground">
                        {form.fields.length} field{form.fields.length !== 1 ? 's' : ''} • {form.status}
                      </span>
                    </div>

                    {form.approvalConfigured && (
                      <span className="text-emerald-500" title="Approval Workflow configured">
                        <CheckCircle2 size={12} />
                      </span>
                    )}

                    <button
                      type="button"
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-100 transition hover:bg-destructive/10 hover:text-destructive xl:opacity-0 xl:group-hover:opacity-100 xl:focus:opacity-100"
                      title="Delete Form"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingForm({ id: form.id, title: form.title || 'Untitled Form' });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Delete Form Custom Modal Box */}
      {deletingForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={() => setDeletingForm(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="delete-form-title" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <div className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <AlertTriangle size={22} />
              </div>
              <button type="button" className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close delete form dialog" onClick={() => setDeletingForm(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-5">
              <h3 id="delete-form-title" className="text-base font-semibold text-foreground">Delete Custom Form?</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Are you sure you want to delete <strong>"{deletingForm.title}"</strong>? This action will permanently remove this form definition from your saved custom forms list.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-border/70 bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted" onClick={() => setDeletingForm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition hover:bg-destructive/90"
                onClick={() => {
                  onDeleteForm(deletingForm.id);
                  setDeletingForm(null);
                }}
              >
                <Trash2 size={15} /> Delete Form
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
