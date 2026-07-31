import { useState, useEffect } from 'react';
import {
  Settings,
  X,
  Plus,
  Trash2,
  Sliders,
  AlertCircle,
  HelpCircle,
  Maximize2,
  Lock,
  CheckSquare,
  ListPlus,
  Text,
} from 'lucide-react';
import type { FormField } from '../../types/formBuilder';
import './FormBuilderPropertiesPanel.css';

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
      <aside className="fbp-panel fbp-panel--empty">
        <div className="fbp-empty-state">
          <Sliders size={40} className="fbp-empty-icon" />
          <h3>No Field Selected</h3>
          <p>Click on any field in the canvas or drag a new component to configure its properties.</p>
        </div>
      </aside>
    );
  }

  const isSelectionField = ['dropdown', 'multiselect', 'checkbox', 'radio'].includes(selectedField.type);
  const isContentField = ['heading', 'paragraph'].includes(selectedField.type);
  const isDivider = selectedField.type === 'divider';

  const handleChange = (key: keyof FormField, value: any) => {
    onUpdateField({
      ...selectedField,
      [key]: value,
    });
  };

  const handleValidationChange = (valKey: string, valValue: any) => {
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
    <aside className="fbp-panel">
      {/* Header */}
      <div className="fbp-header">
        <div className="fbp-header-title">
          <Settings size={18} className="fbp-title-icon" />
          <div>
            <h3>Field Properties</h3>
            <span className="fbp-type-tag">{selectedField.type.replace('_', ' ')}</span>
          </div>
        </div>
        <button type="button" className="fbp-close-btn" onClick={onClose} title="Close properties">
          <X size={16} />
        </button>
      </div>

      {/* Properties Scroll Body */}
      <div className="fbp-body">
        {/* Label */}
        <div className="fbp-field-group">
          <label className="fbp-label">Field Label</label>
          <input
            type="text"
            className="fbp-input"
            value={selectedField.label}
            onChange={(e) => handleChange('label', e.target.value)}
            placeholder="Field Label"
          />
        </div>

        {/* Content (For Heading / Paragraph) */}
        {isContentField && (
          <div className="fbp-field-group">
            <label className="fbp-label">Display Content</label>
            {selectedField.type === 'heading' ? (
              <input
                type="text"
                className="fbp-input"
                value={selectedField.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder="Heading text..."
              />
            ) : (
              <textarea
                className="fbp-textarea"
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
          <div className="fbp-field-group">
            <label className="fbp-label">Placeholder</label>
            <input
              type="text"
              className="fbp-input"
              value={selectedField.placeholder || ''}
              onChange={(e) => handleChange('placeholder', e.target.value)}
              placeholder="e.g. Enter text here..."
            />
          </div>
        )}

        {/* Help Text / Description */}
        {!isDivider && (
          <div className="fbp-field-group">
            <label className="fbp-label">Help Text / Description</label>
            <input
              type="text"
              className="fbp-input"
              value={selectedField.helpText || ''}
              onChange={(e) => handleChange('helpText', e.target.value)}
              placeholder="Subtext shown below the field..."
            />
          </div>
        )}

        {/* Options Editor for Dropdown, Multi Select, Checkbox, Radio */}
        {isSelectionField && (
          <div className="fbp-field-group">
            <div className="fbp-flex-between">
              <label className="fbp-label">Choice Options</label>
              <button type="button" className="fbp-add-opt-btn" onClick={handleAddOption}>
                <Plus size={13} /> Add Option
              </button>
            </div>
            <div className="fbp-options-list">
              {(selectedField.options || []).map((opt, idx) => (
                <div key={idx} className="fbs-option-row">
                  <input
                    type="text"
                    className="fbp-input fbp-input--opt"
                    value={opt}
                    onChange={(e) => handleUpdateOption(idx, e.target.value)}
                  />
                  <button
                    type="button"
                    className="fbp-remove-opt-btn"
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
          <div className="fbp-field-group">
            <label className="fbp-label">Default Value</label>
            <input
              type="text"
              className="fbp-input"
              value={selectedField.defaultValue || ''}
              onChange={(e) => handleChange('defaultValue', e.target.value)}
              placeholder="Optional prefilled value"
            />
          </div>
        )}

        {/* Grid Width (1 Column / 2 Column Span) */}
        {!isDivider && (
          <div className="fbp-field-group">
            <label className="fbp-label">Grid Width Span</label>
            <div className="fbp-toggle-row">
              <button
                type="button"
                className={`fbp-toggle-btn ${selectedField.width === 'half' ? 'fbp-toggle-btn--active' : ''}`}
                onClick={() => handleChange('width', 'half')}
              >
                Half Width (1 Col)
              </button>
              <button
                type="button"
                className={`fbp-toggle-btn ${selectedField.width === 'full' ? 'fbp-toggle-btn--active' : ''}`}
                onClick={() => handleChange('width', 'full')}
              >
                Full Width (2 Cols)
              </button>
            </div>
          </div>
        )}

        {/* Behavior Toggles (Required / Read Only) */}
        {!isContentField && !isDivider && (
          <div className="fbp-section-box">
            <span className="fbp-section-title">Field Behavior & Rules</span>

            <label className="fbp-checkbox-label">
              <input
                type="checkbox"
                checked={selectedField.required}
                onChange={(e) => handleChange('required', e.target.checked)}
              />
              <div className="fbp-chk-text">
                <span>Required Field</span>
                <small>User must fill this before submitting</small>
              </div>
            </label>

            <label className="fbp-checkbox-label">
              <input
                type="checkbox"
                checked={selectedField.readOnly}
                onChange={(e) => handleChange('readOnly', e.target.checked)}
              />
              <div className="fbp-chk-text">
                <span>Read Only</span>
                <small>Field is disabled and cannot be modified by user</small>
              </div>
            </label>
          </div>
        )}

        {/* Advanced Validation Rules */}
        {(selectedField.type === 'number' || selectedField.type === 'text' || selectedField.type === 'currency') && (
          <div className="fbp-section-box">
            <span className="fbp-section-title">Validation Rules</span>

            {selectedField.type === 'number' || selectedField.type === 'currency' ? (
              <div className="fbp-grid-2">
                <div>
                  <label className="fbp-sublabel">Min Value</label>
                  <input
                    type="number"
                    className="fbp-input"
                    value={selectedField.validation?.min ?? ''}
                    onChange={(e) => handleValidationChange('min', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
                <div>
                  <label className="fbp-sublabel">Max Value</label>
                  <input
                    type="number"
                    className="fbp-input"
                    value={selectedField.validation?.max ?? ''}
                    onChange={(e) => handleValidationChange('max', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
              </div>
            ) : (
              <div className="fbp-grid-2">
                <div>
                  <label className="fbp-sublabel">Min Length</label>
                  <input
                    type="number"
                    className="fbp-input"
                    value={selectedField.validation?.min ?? ''}
                    onChange={(e) => handleValidationChange('min', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
                <div>
                  <label className="fbp-sublabel">Max Length</label>
                  <input
                    type="number"
                    className="fbp-input"
                    value={selectedField.validation?.max ?? ''}
                    onChange={(e) => handleValidationChange('max', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
              </div>
            )}

            <div className="fbp-field-group" style={{ marginTop: 10 }}>
              <label className="fbp-sublabel">Custom Error Message</label>
              <input
                type="text"
                className="fbp-input"
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
