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
  Sparkles,
  CheckCircle2,
  Trash2,
  Copy,
} from 'lucide-react';
import { FIELD_PALETTE } from './paletteData';
import type { FormDefinition, FormField, FieldType } from '../../types/formBuilder';
import './FormBuilderSidebar.css';

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
    <aside className="fbs-sidebar">
      {/* Top Sidebar Header & View Switcher */}
      <div className="fbs-header">
        <div className="fbs-nav-tabs">
          <button
            type="button"
            className={`fbs-tab-btn ${sidebarTab === 'palette' ? 'fbs-tab-btn--active' : ''}`}
            onClick={() => setSidebarTab('palette')}
          >
            <Layers size={15} />
            Components
          </button>
          <button
            type="button"
            className={`fbs-tab-btn ${sidebarTab === 'forms' ? 'fbs-tab-btn--active' : ''}`}
            onClick={() => setSidebarTab('forms')}
          >
            <FileText size={15} />
            Form List ({forms.length})
          </button>
        </div>

        <button
          type="button"
          className="fbs-create-btn"
          onClick={onCreateNewForm}
          title="Create New Form"
        >
          <Plus size={16} />
          Create New Form
        </button>
      </div>

      {/* Tab Content: Components Palette */}
      {sidebarTab === 'palette' && (
        <div className="fbs-content">
          <div className="fbs-search-wrap">
            <Search size={14} className="fbs-search-icon" />
            <input
              type="text"
              placeholder="Search components..."
              value={paletteSearch}
              onChange={(e) => setPaletteSearch(e.target.value)}
              className="fbs-search-input"
            />
          </div>

          <div className="fbs-palette-scroll">
            {filteredPalette.map((category) => (
              <div key={category.category} className="fbs-category-group">
                <span className="fbs-category-title">{category.category}</span>
                <div className="fbs-category-grid">
                  {category.items.map((item) => (
                    <div
                      key={item.type}
                      className="fbs-palette-item"
                      draggable
                      onDragStart={(e) => handleDragStart(e, item.type, item.defaultConfig)}
                      onClick={() => onAddField(item.type, item.defaultConfig)}
                    >
                      <div className="fbs-item-icon">
                        {ICON_MAP[item.icon] || <Layers size={16} />}
                      </div>
                      <div className="fbs-item-info">
                        <span className="fbs-item-label">{item.label}</span>
                        <span className="fbs-item-desc">{item.description}</span>
                      </div>
                      <div className="fbs-drag-indicator" title="Drag onto canvas or click to add">
                        <GripVertical size={14} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content: Form List */}
      {sidebarTab === 'forms' && (
        <div className="fbs-content">
          <div className="fbs-search-wrap">
            <Search size={14} className="fbs-search-icon" />
            <input
              type="text"
              placeholder="Search saved forms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="fbs-search-input"
            />
          </div>

          <div className="fbs-forms-list">
            {filteredForms.length === 0 ? (
              <div className="fbs-empty-forms">
                <FileText size={32} />
                <p>No forms found</p>
                <button type="button" className="fbs-empty-create-btn" onClick={onCreateNewForm}>
                  Create your first form
                </button>
              </div>
            ) : (
              filteredForms.map((form) => {
                const isActive = form.id === activeFormId;
                return (
                  <div
                    key={form.id}
                    className={`fbs-form-card ${isActive ? 'fbs-form-card--active' : ''}`}
                    onClick={() => onSelectForm(form.id)}
                  >
                    <div className="fbs-form-card__icon">
                      <FileText size={18} />
                    </div>
                    <div className="fbs-form-card__details">
                      <span className="fbs-form-card__title">{form.title || 'Untitled Form'}</span>
                      <span className="fbs-form-card__meta">
                        {form.fields.length} field{form.fields.length !== 1 ? 's' : ''} • {form.status}
                      </span>
                    </div>

                    {form.approvalConfigured && (
                      <span className="fbs-form-card__badge" title="Approval Workflow configured">
                        <CheckCircle2 size={12} />
                      </span>
                    )}

                    <button
                      type="button"
                      className="fbs-form-card__delete"
                      title="Delete Form"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${form.title}"?`)) {
                          onDeleteForm(form.id);
                        }
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
    </aside>
  );
}
