import { useState } from 'react';
import {
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Eye,
  Edit3,
  Columns2,
  Square,
  Save,
  RotateCcw,
  RotateCw,
  PlusCircle,
  Calendar,
  Clock,
  UploadCloud,
  PenTool,
  DollarSign,
  UserCheck,
  Building,
  ChevronDown,
} from 'lucide-react';
import type { FormDefinition, FormField, FieldType } from '../../types/formBuilder';

const canvasControlClass = 'min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60';

interface FormBuilderCanvasProps {
  form: FormDefinition;
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onUpdateFormHeader: (title: string, description: string) => void;
  onDropField: (type: FieldType, defaultConfig: Partial<FormField>, targetIndex?: number) => void;
  onReorderField: (fieldId: string, targetIndex: number) => void;
  onMoveField: (index: number, direction: 'up' | 'down') => void;
  onDuplicateField: (fieldId: string) => void;
  onDeleteField: (fieldId: string) => void;
  onClearCanvas: () => void;
  onSaveForm: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export default function FormBuilderCanvas({
  form,
  selectedFieldId,
  onSelectField,
  onUpdateFormHeader,
  onDropField,
  onReorderField,
  onMoveField,
  onDuplicateField,
  onDeleteField,
  onClearCanvas,
  onSaveForm,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: FormBuilderCanvasProps) {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [gridCols, setGridCols] = useState<1 | 2>(2);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    fieldId: string;
    position: 'before' | 'after';
  } | null>(null);

  const handleDragOver = (e: React.DragEvent, index?: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy';
    if (index !== undefined) {
      setDragOverIndex(index);
    }
  };

  const getFieldDropTarget = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    const position = e.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
    return {
      position,
      targetIndex: position === 'before' ? index : index + 1,
    } as const;
  };

  const handleFieldDragOver = (e: React.DragEvent<HTMLDivElement>, fieldId: string, index: number) => {
    const target = getFieldDropTarget(e, index);
    handleDragOver(e, target.targetIndex);
    setDropIndicator({ fieldId, position: target.position });
  };

  const handleDrop = (e: React.DragEvent, targetIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
    setDropIndicator(null);
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    try {
      const { source, fieldId, type, defaultConfig } = JSON.parse(data);
      if (source === 'canvas' && fieldId && targetIndex !== undefined) {
        onReorderField(fieldId, targetIndex);
        return;
      }
      if (type) {
        onDropField(type, defaultConfig, targetIndex);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  const handleFieldDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    const target = getFieldDropTarget(e, index);
    handleDrop(e, target.targetIndex);
  };

  const handleFieldDragStart = (e: React.DragEvent, fieldId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/json', JSON.stringify({ source: 'canvas', fieldId }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const clearDropState = () => {
    setDragOverIndex(null);
    setDropIndicator(null);
  };

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/25">
      {/* Sticky Canvas Toolbar */}
      <div className="sticky top-0 z-20 flex flex-col gap-2 border-b border-border/70 bg-card/90 px-3 py-2.5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border bg-muted/50 p-1">
            <button
              type="button"
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${!isPreviewMode ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setIsPreviewMode(false)}
            >
              <Edit3 size={14} /> Edit Builder
            </button>
            <button
              type="button"
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${isPreviewMode ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setIsPreviewMode(true)}
            >
              <Eye size={14} /> Live Preview
            </button>
          </div>

          <div className="hidden h-6 w-px bg-border sm:block" />

          {/* Grid Span Toggle */}
          <div className="flex rounded-xl border border-border bg-muted/50 p-1" title="Canvas Layout Grid Columns">
            <button
              type="button"
              className={`flex size-9 items-center justify-center rounded-lg transition ${gridCols === 1 ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setGridCols(1)}
              title="1 Column Layout"
            >
              <Square size={16} />
            </button>
            <button
              type="button"
              className={`flex size-9 items-center justify-center rounded-lg transition ${gridCols === 2 ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setGridCols(2)}
              title="2 Columns Grid Layout"
            >
              <Columns2 size={16} />
            </button>
          </div>

          <div className="hidden h-6 w-px bg-border sm:block" />

          {/* Undo / Redo */}
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Y)"
          >
            <RotateCw size={15} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onClearCanvas}
            disabled={form.fields.length === 0}
          >
            <Trash2 size={14} /> Clear Canvas
          </button>

          <button type="button" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90" onClick={onSaveForm}>
            <Save size={16} /> Save Form
          </button>
        </div>
      </div>

      {/* Main Canvas Scroll Area */}
      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-4">
        {/* Continuous Single Document Sheet */}
        <div className={`min-h-full w-full rounded-2xl border bg-card p-4 shadow-sm sm:p-6 ${isPreviewMode ? 'border-border/70' : 'border-primary/15'}`}>
          {/* Form Header (Editable Title & Description) */}
          <div className="border-b border-border/70 pb-6">
            {isPreviewMode ? (
              <>
                <h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground">{form.title || 'Untitled Form'}</h1>
                {form.description && <p className="mt-2 text-sm leading-6 text-muted-foreground">{form.description}</p>}
              </>
            ) : (
              <>
                <input
                  type="text"
                  className="w-full border-0 bg-transparent text-2xl font-semibold tracking-[-0.035em] text-foreground outline-none placeholder:text-muted-foreground"
                  value={form.title}
                  onChange={(e) => onUpdateFormHeader(e.target.value, form.description)}
                  placeholder="Enter Form Title..."
                />
                <input
                  type="text"
                  className="mt-2 w-full border-0 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/70"
                  value={form.description}
                  onChange={(e) => onUpdateFormHeader(form.title, e.target.value)}
                  placeholder="Enter form description or instructions..."
                />
              </>
            )}
          </div>

          {/* Form Fields Grid Canvas */}
          {form.fields.length === 0 ? (
            <div
              className={`mt-6 flex min-h-96 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${dragOverIndex === 0 ? 'border-primary bg-primary/[0.05]' : 'border-border bg-muted/20'}`}
              onDragOver={(e) => handleDragOver(e, 0)}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={(e) => handleDrop(e, 0)}
            >
              <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <PlusCircle size={44} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">Drag & Drop Components Here</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">Or click any field from the left sidebar to start building your custom form.</p>
            </div>
          ) : (
            <div
              className={`mt-6 grid gap-4 ${gridCols === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clearDropState();
              }}
            >
              {form.fields.map((field, index) => {
                const isSelected = field.id === selectedFieldId;
                const isSectionType = field.type === 'heading' || field.type === 'divider' || field.type === 'paragraph';
                const isFullWidth = field.width === 'full' || isSectionType || field.type === 'file' || field.type === 'signature';

                return (
                  <div
                    key={field.id}
                    data-canvas-field={field.id}
                    className={`group relative rounded-xl transition ${isFullWidth ? 'md:col-span-2' : ''} ${isSelected ? 'bg-primary/[0.025] ring-2 ring-primary/75 ring-offset-4 ring-offset-card' : ''} ${isPreviewMode ? 'p-4' : 'cursor-pointer border border-transparent p-3 hover:border-primary/25 hover:bg-primary/[0.025]'}`}
                    onClick={() => !isPreviewMode && onSelectField(field.id)}
                    onDragOver={(e) => handleFieldDragOver(e, field.id, index)}
                    onDrop={(e) => handleFieldDrop(e, index)}
                  >
                    {dropIndicator?.fieldId === field.id && (
                      <div
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-x-2 z-20 flex items-center ${dropIndicator.position === 'before' ? '-top-2.5' : '-bottom-2.5'}`}
                      >
                        <span className="size-2.5 rounded-full bg-primary ring-4 ring-card" />
                        <span className="h-0.5 flex-1 rounded-full bg-primary" />
                      </div>
                    )}
                    {!isPreviewMode && (
                      <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="cursor-grab rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
                            title="Drag to reorder field"
                            draggable
                            onDragStart={(e) => handleFieldDragStart(e, field.id)}
                            onDragEnd={clearDropState}
                          >
                            <GripVertical size={14} />
                          </span>
                          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{field.type.replace('_', ' ')}</span>
                        </div>

                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                            disabled={index === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveField(index, 'up');
                            }}
                            title="Move Up"
                          >
                            <ArrowUp size={13} />
                          </button>

                          <button
                            type="button"
                            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                            disabled={index === form.fields.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveField(index, 'down');
                            }}
                            title="Move Down"
                          >
                            <ArrowDown size={13} />
                          </button>

                          <button
                            type="button"
                            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicateField(field.id);
                            }}
                            title="Duplicate Field"
                          >
                            <Copy size={13} />
                          </button>

                          <button
                            type="button"
                            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteField(field.id);
                            }}
                            title="Delete Field"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Field Render View */}
                    <div>
                      {renderFieldComponent(field)}
                    </div>
                  </div>
                );
              })}

              <div
                className={`col-span-full flex min-h-10 items-center justify-center rounded-xl border-2 border-dashed transition ${dragOverIndex === form.fields.length && !dropIndicator ? 'border-primary bg-primary/[0.05]' : 'border-transparent'}`}
                onDragOver={(e) => {
                  handleDragOver(e, form.fields.length);
                  setDropIndicator(null);
                }}
                onDrop={(e) => handleDrop(e, form.fields.length)}
                aria-label="Drop field at end of form"
              >
                <span className={`text-xs font-semibold text-primary transition-opacity ${dragOverIndex === form.fields.length && !dropIndicator ? 'opacity-100' : 'opacity-0'}`}>
                  Drop here to add at the end
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function renderFieldComponent(field: FormField) {
  const { type, label, placeholder, required, readOnly, helpText, options, content, defaultValue } = field;

  if (type === 'heading') {
    return (
      <div className="border-b border-border/70 pb-2">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{content || label || 'Heading Text'}</h2>
      </div>
    );
  }

  if (type === 'paragraph') {
    return (
      <div>
        <p className="text-sm leading-6 text-muted-foreground">{content || helpText || 'Paragraph description text...'}</p>
      </div>
    );
  }

  if (type === 'divider') {
    return <hr className="border-border" />;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>

      {type === 'text' && (
        <input
          type="text"
          className={canvasControlClass}
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={readOnly}
        />
      )}

      {type === 'textarea' && (
        <textarea
          className={`${canvasControlClass} min-h-24 resize-y py-2.5`}
          rows={3}
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={readOnly}
        />
      )}

      {type === 'number' && (
        <input
          type="number"
          className={canvasControlClass}
          placeholder={placeholder || '0'}
          defaultValue={defaultValue}
          disabled={readOnly}
        />
      )}

      {type === 'email' && (
        <input
          type="email"
          className={canvasControlClass}
          placeholder={placeholder || 'example@domain.com'}
          defaultValue={defaultValue}
          disabled={readOnly}
        />
      )}

      {type === 'phone' && (
        <input
          type="tel"
          className={canvasControlClass}
          placeholder={placeholder || '+1 (555) 000-0000'}
          defaultValue={defaultValue}
          disabled={readOnly}
        />
      )}

      {type === 'currency' && (
        <div className="relative">
          <DollarSign size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="number"
            step="0.01"
            className={`${canvasControlClass} pl-9`}
            placeholder={placeholder || '0.00'}
            defaultValue={defaultValue}
            disabled={readOnly}
          />
        </div>
      )}

      {type === 'date' && (
        <div className="relative">
          <Calendar size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="date"
            className={`${canvasControlClass} pl-9`}
            disabled={readOnly}
          />
        </div>
      )}

      {type === 'time' && (
        <div className="relative">
          <Clock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="time"
            className={`${canvasControlClass} pl-9`}
            disabled={readOnly}
          />
        </div>
      )}

      {type === 'dropdown' && (
        <div className="relative">
          <select className={`${canvasControlClass} appearance-none pr-11`} disabled={readOnly}>
            <option value="">{placeholder || 'Select an option'}</option>
            {(options || ['Option 1', 'Option 2']).map((opt, i) => (
              <option key={i} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      )}

      {type === 'multiselect' && (
        <select className={`${canvasControlClass} min-h-28 py-2`} multiple disabled={readOnly}>
          {(options || ['Option A', 'Option B', 'Option C']).map((opt, i) => (
            <option key={i} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {type === 'checkbox' && (
        <div className="flex flex-col gap-2">
          {(options || ['Option 1', 'Option 2']).map((opt, i) => (
            <label key={i} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-foreground transition hover:bg-muted">
              <input type="checkbox" disabled={readOnly} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {type === 'radio' && (
        <div className="flex flex-col gap-2">
          {(options || ['Choice 1', 'Choice 2']).map((opt, i) => (
            <label key={i} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-foreground transition hover:bg-muted">
              <input type="radio" name={`radio-${field.id}`} disabled={readOnly} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {type === 'file' && (
        <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center text-muted-foreground">
          <UploadCloud size={24} className="text-primary" />
          <span className="mt-2 text-xs font-semibold text-foreground">Click or drag files to upload</span>
          <small className="mt-1 text-[11px]">Max file size: 10MB</small>
        </div>
      )}

      {type === 'signature' && (
        <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center text-muted-foreground">
          <PenTool size={20} className="text-primary" />
          <span className="mt-2 text-xs font-semibold text-foreground">Sign here with mouse or touch pad</span>
        </div>
      )}

      {type === 'user_picker' && (
        <div className="relative">
          <UserCheck size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            className={`${canvasControlClass} pl-9`}
            placeholder={placeholder || 'Select employee or manager...'}
            disabled={readOnly}
          />
        </div>
      )}

      {type === 'vendor_picker' && (
        <div className="relative">
          <Building size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            className={`${canvasControlClass} pl-9`}
            placeholder={placeholder || 'Select vendor from directory...'}
            disabled={readOnly}
          />
        </div>
      )}

      {helpText && <span className="text-[11px] leading-4 text-muted-foreground">{helpText}</span>}
    </div>
  );
}
