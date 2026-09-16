import {
  Settings,
  X,
  Plus,
  Trash2,
  Sliders,
} from 'lucide-react';
import type { FieldValidation, FormField } from '../../types/formBuilder';

const fieldGroupClass = 'flex flex-col gap-1.5';
const labelClass = 'text-xs font-semibold text-foreground';
const inputClass = 'min-h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15';

interface FormBuilderPropertiesPanelProps {
  selectedField: FormField | null;
  onUpdateField: (updatedField: FormField) => void;
  onClose: () => void;
}

export default function FormBuilderPropertiesPanel({
  selectedField,
  onUpdateField,
  onClose,
}: FormBuilderPropertiesPanelProps) {
  if (!selectedField) {
    return (
      <aside className="hidden min-h-0 w-72 shrink-0 flex-col border-l border-border/70 bg-card xl:flex 2xl:w-80">
        <div className="m-auto flex max-w-[240px] flex-col items-center px-5 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Sliders size={30} /></div>
          <h3 className="mt-4 text-sm font-semibold text-foreground">No Field Selected</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Click on any field in the canvas or drag a new component to configure its properties.</p>
        </div>
      </aside>
    );
  }

  const isSelectionField = ['dropdown', 'multiselect', 'checkbox', 'radio'].includes(selectedField.type);
  const isContentField = ['heading', 'paragraph'].includes(selectedField.type);
  const isDivider = selectedField.type === 'divider';

  const handleChange = <K extends keyof FormField>(key: K, value: FormField[K]) => {
    onUpdateField({
      ...selectedField,
      [key]: value,
    });
  };

  const handleValidationChange = <K extends keyof FieldValidation>(
    valKey: K,
    valValue: FieldValidation[K]
  ) => {
    onUpdateField({
      ...selectedField,
      validation: {
        ...selectedField.validation,
        [valKey]: valValue,
      },
    });
  };

  const handleAddOption = () => {
    const currentOptions = selectedField.options || [];
    const newOptionName = `Option ${currentOptions.length + 1}`;
    handleChange('options', [...currentOptions, newOptionName]);
  };

  const handleUpdateOption = (index: number, value: string) => {
    const currentOptions = [...(selectedField.options || [])];
    currentOptions[index] = value;
    handleChange('options', currentOptions);
  };

  const handleRemoveOption = (index: number) => {
    const currentOptions = [...(selectedField.options || [])];
    currentOptions.splice(index, 1);
    handleChange('options', currentOptions);
  };

  return (
    <aside className="min-h-0 w-full overflow-hidden border-t border-border/70 bg-card xl:flex xl:w-72 xl:shrink-0 xl:flex-col xl:border-l xl:border-t-0 2xl:w-80">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Settings size={18} className="text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Field Properties</h3>
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{selectedField.type.replace('_', ' ')}</span>
          </div>
        </div>
        <button type="button" className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={onClose} title="Close properties" aria-label="Close properties">
          <X size={16} />
        </button>
      </div>

      {/* Properties Scroll Body */}
      <div className="flex max-h-96 flex-col gap-5 overflow-y-auto overscroll-contain p-4 xl:max-h-none xl:min-h-0 xl:flex-1">
        {/* Label */}
        <div className={fieldGroupClass}>
          <label className={labelClass}>Field Label</label>
          <input
            type="text"
            className={inputClass}
            value={selectedField.label}
            onChange={(e) => handleChange('label', e.target.value)}
            placeholder="Field Label"
          />
        </div>

        {/* Content (For Heading / Paragraph) */}
        {isContentField && (
          <div className={fieldGroupClass}>
            <label className={labelClass}>Display Content</label>
            {selectedField.type === 'heading' ? (
              <input
                type="text"
                className={inputClass}
                value={selectedField.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Heading text..."
              />
            ) : (
              <textarea
                className={`${inputClass} min-h-24 resize-y py-2.5`}
                rows={3}
                value={selectedField.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Paragraph description text..."
              />
            )}
          </div>
        )}

        {/* Placeholder (For Inputs & Selects) */}
        {!isContentField && !isDivider && selectedField.type !== 'signature' && selectedField.type !== 'file' && (
          <div className={fieldGroupClass}>
            <label className={labelClass}>Placeholder</label>
            <input
              type="text"
              className={inputClass}
              value={selectedField.placeholder || ''}
              onChange={(e) => handleChange('placeholder', e.target.value)}
              placeholder="e.g. Enter text here..."
            />
          </div>
        )}

        {/* Help Text / Description */}
        {!isDivider && (
          <div className={fieldGroupClass}>
            <label className={labelClass}>Help Text / Description</label>
            <input
              type="text"
              className={inputClass}
              value={selectedField.helpText || ''}
              onChange={(e) => handleChange('helpText', e.target.value)}
              placeholder="Subtext shown below the field..."
            />
          </div>
        )}

        {/* Options Editor for Dropdown, Multi Select, Checkbox, Radio */}
        {isSelectionField && (
          <div className={fieldGroupClass}>
            <div className="flex items-center justify-between gap-2">
              <label className={labelClass}>Choice Options</label>
              <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary transition hover:bg-primary/10" onClick={handleAddOption}>
                <Plus size={13} /> Add Option
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {(selectedField.options || []).map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    className={inputClass}
                    value={opt}
                    onChange={(e) => handleUpdateOption(idx, e.target.value)}
                  />
                  <button
                    type="button"
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleRemoveOption(idx)}
                    title="Remove option"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Default Value */}
        {!isContentField && !isDivider && selectedField.type !== 'file' && selectedField.type !== 'signature' && (
          <div className={fieldGroupClass}>
            <label className={labelClass}>Default Value</label>
            <input
              type="text"
              className={inputClass}
              value={selectedField.defaultValue || ''}
              onChange={(e) => handleChange('defaultValue', e.target.value)}
              placeholder="Optional prefilled value"
            />
          </div>
        )}

        {/* Grid Width (1 Column / 2 Column Span) */}
        {!isDivider && (
          <div className={fieldGroupClass}>
            <label className={labelClass}>Grid Width Span</label>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1">
              <button
                type="button"
                className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition ${selectedField.width === 'half' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => handleChange('width', 'half')}
              >
                Half Width (1 Col)
              </button>
              <button
                type="button"
                className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition ${selectedField.width === 'full' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => handleChange('width', 'full')}
              >
                Full Width (2 Cols)
              </button>
            </div>
          </div>
        )}

        {/* Behavior Toggles (Required / Read Only) */}
        {!isContentField && !isDivider && (
          <div className="rounded-xl border border-border bg-muted/25 p-3.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Field Behavior & Rules</span>

            <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-muted">
              <input
                type="checkbox"
                checked={selectedField.required}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onUpdateField({
                    ...selectedField,
                    required: checked,
                    readOnly: checked ? false : selectedField.readOnly,
                  });
                }}
              />
              <div className="flex flex-col text-xs">
                <span className="font-semibold text-foreground">Required Field</span>
                <small className="mt-0.5 leading-4 text-muted-foreground">User must fill this before submitting</small>
              </div>
            </label>

            <label className="mt-1 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-muted">
              <input
                type="checkbox"
                checked={selectedField.readOnly}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onUpdateField({
                    ...selectedField,
                    readOnly: checked,
                    required: checked ? false : selectedField.required,
                  });
                }}
              />
              <div className="flex flex-col text-xs">
                <span className="font-semibold text-foreground">Read Only</span>
                <small className="mt-0.5 leading-4 text-muted-foreground">Field is disabled and cannot be modified by user</small>
              </div>
            </label>
          </div>
        )}

        {/* Advanced Validation Rules */}
        {(selectedField.type === 'number' || selectedField.type === 'text' || selectedField.type === 'currency') && (
          <div className="rounded-xl border border-border bg-muted/25 p-3.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Validation Rules</span>

            {selectedField.type === 'number' || selectedField.type === 'currency' ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-muted-foreground">Min Value</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={selectedField.validation?.min ?? ''}
                    onChange={(e) => handleValidationChange('min', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-muted-foreground">Max Value</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={selectedField.validation?.max ?? ''}
                    onChange={(e) => handleValidationChange('max', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-muted-foreground">Min Length</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={selectedField.validation?.min ?? ''}
                    onChange={(e) => handleValidationChange('min', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-muted-foreground">Max Length</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={selectedField.validation?.max ?? ''}
                    onChange={(e) => handleValidationChange('max', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-muted-foreground">Custom Error Message</label>
              <input
                type="text"
                className={inputClass}
                placeholder="Custom validation alert message..."
                value={selectedField.validation?.customError || ''}
                onChange={(e) => handleValidationChange('customError', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
