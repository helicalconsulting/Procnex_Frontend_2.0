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
import './FormBuilderCanvas.css';

interface FormBuilderCanvasProps {
  form: FormDefinition;
  selectedFieldId: string | null;
  onSelectField: (fieldId: string) => void;
  onUpdateFormHeader: (title: string, description: string) => void;
  onDropField: (type: FieldType, defaultConfig: Partial<FormField>, targetIndex?: number) => void;
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

  const handleDragOver = (e: React.DragEvent, index?: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (index !== undefined) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex?: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    try {
      const { type, defaultConfig } = JSON.parse(data);
      if (type) {
        onDropField(type, defaultConfig, targetIndex);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  return (
    <main className="fbc-canvas-wrapper">
      {/* Sticky Canvas Toolbar */}
      <div className="fbc-toolbar">
        <div className="fbc-toolbar-left">
          <div className="fbc-mode-switcher">
            <button
              type="button"
              className={`fbc-mode-btn ${!isPreviewMode ? 'fbc-mode-btn--active' : ''}`}
              onClick={() => setIsPreviewMode(false)}
            >
              <Edit3 size={14} /> Edit Builder
            </button>
            <button
              type="button"
              className={`fbc-mode-btn ${isPreviewMode ? 'fbc-mode-btn--active' : ''}`}
              onClick={() => setIsPreviewMode(true)}
            >
              <Eye size={14} /> Live Preview
            </button>
          </div>

          <div className="fbc-divider-v" />

          {/* Grid Span Toggle */}
          <div className="fbc-grid-switcher" title="Canvas Layout Grid Columns">
            <button
              type="button"
              className={`fbc-icon-btn ${gridCols === 1 ? 'fbc-icon-btn--active' : ''}`}
              onClick={() => setGridCols(1)}
              title="1 Column Layout"
            >
              <Square size={16} />
            </button>
            <button
              type="button"
              className={`fbc-icon-btn ${gridCols === 2 ? 'fbc-icon-btn--active' : ''}`}
              onClick={() => setGridCols(2)}
              title="2 Columns Grid Layout"
            >
              <Columns2 size={16} />
            </button>
          </div>

          <div className="fbc-divider-v" />

          {/* Undo / Redo */}
          <button
            type="button"
            className="fbc-icon-btn"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            className="fbc-icon-btn"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Y)"
          >
            <RotateCw size={15} />
          </button>
        </div>

        <div className="fbc-toolbar-right">
          <button
            type="button"
            className="fbc-clear-btn"
            onClick={onClearCanvas}
            disabled={form.fields.length === 0}
          >
            <Trash2 size={14} /> Clear Canvas
          </button>

          <button type="button" className="fbc-save-btn" onClick={onSaveForm}>
            <Save size={16} /> Save Form
          </button>
        </div>
      </div>

      {/* Main Canvas Scroll Area */}
      <div className="fbc-canvas-scroll">
        {/* Continuous Single Document Sheet */}
        <div className={`fbc-form-document ${isPreviewMode ? 'fbc-form-document--preview' : ''}`}>
          {/* Form Header (Editable Title & Description) */}
          <div className="fbc-form-header">
            {isPreviewMode ? (
              <>
                <h1 className="fbc-preview-title">{form.title || 'Untitled Form'}</h1>
                {form.description && <p className="fbc-preview-desc">{form.description}</p>}
              </>
            ) : (
              <>
                <input
                  type="text"
                  className="fbc-header-title-input"
                  value={form.title}
                  onChange={(e) => onUpdateFormHeader(e.target.value, form.description)}
                  placeholder="Enter Form Title..."
                />
                <input
                  type="text"
                  className="fbc-header-desc-input"
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
              className={`fbc-empty-dropzone ${dragOverIndex === 0 ? 'fbc-empty-dropzone--active' : ''}`}
              onDragOver={(e) => handleDragOver(e, 0)}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={(e) => handleDrop(e, 0)}
            >
              <div className="fbc-dropzone-icon">
                <PlusCircle size={44} />
              </div>
              <h3>Drag & Drop Components Here</h3>
              <p>Or click any field from the left sidebar to start building your custom form.</p>
            </div>
          ) : (
            <div
              className={`fbc-fields-grid ${gridCols === 1 ? 'fbc-fields-grid--1col' : 'fbc-fields-grid--2col'}`}
              onDragOver={(e) => handleDragOver(e, form.fields.length)}
              onDrop={(e) => handleDrop(e, form.fields.length)}
            >
              {form.fields.map((field, index) => {
                const isSelected = field.id === selectedFieldId;
                const isSectionType = field.type === 'heading' || field.type === 'divider' || field.type === 'paragraph';
                const isFullWidth = field.width === 'full' || isSectionType || field.type === 'file' || field.type === 'signature';

                return (
                  <div
                    key={field.id}
                    className={`fbc-field-wrapper ${isSectionType ? 'fbc-field-wrapper--section' : ''} ${isFullWidth ? 'fbc-field-wrapper--full' : 'fbc-field-wrapper--half'} ${isSelected ? 'fbc-field-wrapper--selected' : ''} ${isPreviewMode ? 'fbc-field-wrapper--preview' : ''}`}
                    onClick={() => !isPreviewMode && onSelectField(field.id)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    {!isPreviewMode && (
                      <div className="fbc-field-toolbar">
                        <div className="fbc-field-toolbar-left">
                          <span className="fbc-drag-handle" title="Drag field">
                            <GripVertical size={14} />
                          </span>
                          <span className="fbc-field-type-badge">{field.type.replace('_', ' ')}</span>
                        </div>

                        <div className="fbc-field-actions">
                          <button
                            type="button"
                            className="fbc-action-btn"
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
                            className="fbc-action-btn"
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
                            className="fbc-action-btn"
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
                            className="fbc-action-btn fbc-action-btn--delete"
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
                    <div className="fbc-field-content">
                      {renderFieldComponent(field, isPreviewMode)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Field Renderer Function for Canvas / Preview ─────────────
function renderFieldComponent(field: FormField, isPreviewMode: boolean) {
  const { type, label, placeholder, required, readOnly, helpText, options, content, defaultValue } = field;

  if (type === 'heading') {
    return (
      <div className="fbc-heading-block">
        <h2>{content || label || 'Heading Text'}</h2>
      </div>
    );
  }

  if (type === 'paragraph') {
    return (
      <div className="fbc-paragraph-block">
        <p>{content || helpText || 'Paragraph description text...'}</p>
      </div>
    );
  }

  if (type === 'divider') {
    return <hr className="fbc-divider-line" />;
  }

  return (
    <div className="fbc-input-group">
      <label className="fbc-input-label">
        {label}
        {required && <span className="fbc-req-star">*</span>}
      </label>

      {/* Field Input Control depending on type */}
      {type === 'text' && (
        <input
          type="text"
          className="fbc-input-control"
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={readOnly}
        />
      )}

      {type === 'textarea' && (
        <textarea
          className="fbc-input-control fbc-textarea-control"
          rows={3}
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={readOnly}
        />
      )}

      {type === 'number' && (
        <input
          type="number"
          className="fbc-input-control"
          placeholder={placeholder || '0'}
          defaultValue={defaultValue}
          disabled={readOnly}
        />
      )}

      {type === 'email' && (
        <input
          type="email"
          className="fbc-input-control"
          placeholder={placeholder || 'example@domain.com'}
          defaultValue={defaultValue}
          disabled={readOnly}
        />
      )}

      {type === 'phone' && (
        <input
          type="tel"
          className="fbc-input-control"
          placeholder={placeholder || '+1 (555) 000-0000'}
          defaultValue={defaultValue}
          disabled={readOnly}
        />
      )}

      {type === 'currency' && (
        <div className="fbc-icon-input-wrap">
          <DollarSign size={16} className="fbc-input-icon" />
          <input
            type="number"
            step="0.01"
            className="fbc-input-control fbc-input-control--icon"
            placeholder={placeholder || '0.00'}
            defaultValue={defaultValue}
            disabled={readOnly}
          />
        </div>
      )}

      {type === 'date' && (
        <div className="fbc-icon-input-wrap">
          <Calendar size={16} className="fbc-input-icon" />
          <input
            type="date"
            className="fbc-input-control fbc-input-control--icon"
            disabled={readOnly}
          />
        </div>
      )}

      {type === 'time' && (
        <div className="fbc-icon-input-wrap">
          <Clock size={16} className="fbc-input-icon" />
          <input
            type="time"
            className="fbc-input-control fbc-input-control--icon"
            disabled={readOnly}
          />
        </div>
      )}

      {type === 'dropdown' && (
        <div className="fbc-icon-input-wrap">
          <select className="fbc-input-control fbc-select-control" disabled={readOnly}>
            <option value="">{placeholder || 'Select an option'}</option>
            {(options || ['Option 1', 'Option 2']).map((opt, i) => (
              <option key={i} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="fbc-select-arrow" />
        </div>
      )}

      {type === 'multiselect' && (
        <select className="fbc-input-control fbc-select-control" multiple disabled={readOnly}>
          {(options || ['Option A', 'Option B', 'Option C']).map((opt, i) => (
            <option key={i} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {type === 'checkbox' && (
        <div className="fbc-choice-group">
          {(options || ['Option 1', 'Option 2']).map((opt, i) => (
            <label key={i} className="fbc-choice-label">
              <input type="checkbox" disabled={readOnly} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {type === 'radio' && (
        <div className="fbc-choice-group">
          {(options || ['Choice 1', 'Choice 2']).map((opt, i) => (
            <label key={i} className="fbc-choice-label">
              <input type="radio" name={`radio-${field.id}`} disabled={readOnly} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}

      {type === 'file' && (
        <div className="fbc-file-upload-box">
          <UploadCloud size={24} className="fbc-upload-icon" />
          <span>Click or drag files to upload</span>
          <small>Max file size: 10MB</small>
        </div>
      )}

      {type === 'signature' && (
        <div className="fbc-signature-pad">
          <PenTool size={20} className="fbc-sig-icon" />
          <span>Sign here with mouse or touch pad</span>
        </div>
      )}

      {type === 'user_picker' && (
        <div className="fbc-icon-input-wrap">
          <UserCheck size={16} className="fbc-input-icon" />
          <input
            type="text"
            className="fbc-input-control fbc-input-control--icon"
            placeholder={placeholder || 'Select employee or manager...'}
            disabled={readOnly}
          />
        </div>
      )}

      {type === 'vendor_picker' && (
        <div className="fbc-icon-input-wrap">
          <Building size={16} className="fbc-input-icon" />
          <input
            type="text"
            className="fbc-input-control fbc-input-control--icon"
            placeholder={placeholder || 'Select vendor from directory...'}
            disabled={readOnly}
          />
        </div>
      )}

      {helpText && <span className="fbc-help-text">{helpText}</span>}
    </div>
  );
}
