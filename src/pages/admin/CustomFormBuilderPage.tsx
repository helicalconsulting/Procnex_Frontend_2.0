import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FormBuilderSidebar from '../../components/form-builder/FormBuilderSidebar';
import FormBuilderCanvas from '../../components/form-builder/FormBuilderCanvas';
import FormBuilderPropertiesPanel from '../../components/form-builder/FormBuilderPropertiesPanel';
import FormSaveWorkflowModal from '../../components/form-builder/FormSaveWorkflowModal';
import FormPublishSuccessModal from '../../components/form-builder/FormPublishSuccessModal';
import { formWorkflowService, type AudienceType } from '../../services/formWorkflowService';
import type { FormDefinition, FormField, FieldType } from '../../types/formBuilder';
import './CustomFormBuilderPage.css';

const STORAGE_KEY = 'heliflow_custom_forms';

const INITIAL_NEW_FORM: FormDefinition = {
  id: 'form-initial-1',
  title: 'Untitled Custom Form',
  description: 'Add form description...',
  fields: [],
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default function CustomFormBuilderPage() {
  const [forms, setForms] = useState<FormDefinition[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error reading saved forms:', e);
    }
    return [INITIAL_NEW_FORM];
  });

  const navigate = useNavigate();
  const [activeFormId, setActiveFormId] = useState<string>(() => forms[0]?.id || INITIAL_NEW_FORM.id);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'palette' | 'forms'>('palette');
  const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false);
  const [successModalData, setSuccessModalData] = useState<{
    isOpen: boolean;
    formTitle: string;
    recipientCount: number;
    audienceType: AudienceType;
    dueDate: string;
    priority: string;
    hasWorkflow: boolean;
  }>({
    isOpen: false,
    formTitle: '',
    recipientCount: 0,
    audienceType: 'whole_org',
    dueDate: '',
    priority: 'Medium',
    hasWorkflow: false,
  });

  // Undo / Redo stacks
  const [history, setHistory] = useState<FormDefinition[]>([]);
  const [redoStack, setRedoStack] = useState<FormDefinition[]>([]);

  // Get active form definition
  const activeForm = forms.find((f) => f.id === activeFormId) || forms[0] || INITIAL_NEW_FORM;

  // Persist to localStorage whenever forms change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
    } catch (e) {
      console.error('Failed to save forms to localStorage:', e);
    }
  }, [forms]);

  // Helper to record history state
  const pushHistory = useCallback(
    (newActiveForm: FormDefinition) => {
      setHistory((prev) => [...prev, activeForm]);
      setRedoStack([]);
      setForms((prevForms) =>
        prevForms.map((f) => (f.id === newActiveForm.id ? newActiveForm : f))
      );
    },
    [activeForm]
  );

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack((prev) => [activeForm, ...prev]);
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setForms((prevForms) =>
      prevForms.map((f) => (f.id === previous.id ? previous : f))
    );
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setHistory((prev) => [...prev, activeForm]);
    setRedoStack((prev) => prev.slice(1));
    setForms((prevForms) =>
      prevForms.map((f) => (f.id === next.id ? next : f))
    );
  };

  // Sidebar Form Operations
  const handleCreateNewForm = () => {
    const newForm: FormDefinition = {
      id: `form-${Date.now()}`,
      title: 'Untitled Custom Form',
      description: 'Add description here...',
      fields: [],
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setForms((prev) => [newForm, ...prev]);
    setActiveFormId(newForm.id);
    setSelectedFieldId(null);
    setSidebarTab('palette');
  };

  const handleSelectForm = (formId: string) => {
    setActiveFormId(formId);
    setSelectedFieldId(null);
    setHistory([]);
    setRedoStack([]);
  };

  const handleDeleteForm = (formId: string) => {
    setForms((prev) => {
      const remaining = prev.filter((f) => f.id !== formId);
      if (activeFormId === formId && remaining.length > 0) {
        setActiveFormId(remaining[0].id);
      }
      return remaining;
    });
  };

  // Header update
  const handleUpdateFormHeader = (title: string, description: string) => {
    const updated = {
      ...activeForm,
      title,
      description,
      updatedAt: new Date().toISOString(),
    };
    pushHistory(updated);
  };

  // Canvas Operations
  const handleAddField = (type: FieldType, defaultConfig: Partial<FormField>) => {
    const newField: FormField = {
      id: `field-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      label: defaultConfig.label || 'New Field',
      placeholder: defaultConfig.placeholder || '',
      required: defaultConfig.required ?? false,
      readOnly: defaultConfig.readOnly ?? false,
      defaultValue: defaultConfig.defaultValue || '',
      width: defaultConfig.width || 'full',
      helpText: defaultConfig.helpText || '',
      options: defaultConfig.options ? [...defaultConfig.options] : undefined,
      content: defaultConfig.content || '',
    };

    const updated = {
      ...activeForm,
      fields: [...activeForm.fields, newField],
      updatedAt: new Date().toISOString(),
    };

    pushHistory(updated);
    setSelectedFieldId(newField.id);
  };

  const handleDropField = (
    type: FieldType,
    defaultConfig: Partial<FormField>,
    targetIndex?: number
  ) => {
    const newField: FormField = {
      id: `field-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      label: defaultConfig.label || 'New Field',
      placeholder: defaultConfig.placeholder || '',
      required: defaultConfig.required ?? false,
      readOnly: defaultConfig.readOnly ?? false,
      defaultValue: defaultConfig.defaultValue || '',
      width: defaultConfig.width || 'full',
      helpText: defaultConfig.helpText || '',
      options: defaultConfig.options ? [...defaultConfig.options] : undefined,
      content: defaultConfig.content || '',
    };

    const newFields = [...activeForm.fields];
    if (targetIndex !== undefined && targetIndex >= 0 && targetIndex <= newFields.length) {
      newFields.splice(targetIndex, 0, newField);
    } else {
      newFields.push(newField);
    }

    const updated = {
      ...activeForm,
      fields: newFields,
      updatedAt: new Date().toISOString(),
    };

    pushHistory(updated);
    setSelectedFieldId(newField.id);
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= activeForm.fields.length) return;

    const newFields = [...activeForm.fields];
    const [moved] = newFields.splice(index, 1);
    newFields.splice(targetIdx, 0, moved);

    const updated = {
      ...activeForm,
      fields: newFields,
      updatedAt: new Date().toISOString(),
    };

    pushHistory(updated);
  };

  const handleDuplicateField = (fieldId: string) => {
    const idx = activeForm.fields.findIndex((f) => f.id === fieldId);
    if (idx === -1) return;

    const original = activeForm.fields[idx];
    const copy: FormField = {
      ...original,
      id: `field-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      label: `${original.label} (Copy)`,
      options: original.options ? [...original.options] : undefined,
    };

    const newFields = [...activeForm.fields];
    newFields.splice(idx + 1, 0, copy);

    const updated = {
      ...activeForm,
      fields: newFields,
      updatedAt: new Date().toISOString(),
    };

    pushHistory(updated);
    setSelectedFieldId(copy.id);
  };

  const handleDeleteField = (fieldId: string) => {
    const newFields = activeForm.fields.filter((f) => f.id !== fieldId);
    const updated = {
      ...activeForm,
      fields: newFields,
      updatedAt: new Date().toISOString(),
    };

    pushHistory(updated);
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    }
  };

  const handleClearCanvas = () => {
    if (!confirm('Clear all fields from the canvas?')) return;
    const updated = {
      ...activeForm,
      fields: [],
      updatedAt: new Date().toISOString(),
    };
    pushHistory(updated);
    setSelectedFieldId(null);
  };

  const handleUpdateField = (updatedField: FormField) => {
    const newFields = activeForm.fields.map((f) => (f.id === updatedField.id ? updatedField : f));
    const updated = {
      ...activeForm,
      fields: newFields,
      updatedAt: new Date().toISOString(),
    };
    pushHistory(updated);
  };

  // Workflow Modal Actions
  const handleSaveForm = () => {
    setIsWorkflowModalOpen(true);
  };

  const handleSaveAsDraft = () => {
    setIsWorkflowModalOpen(false);
    const updated = {
      ...activeForm,
      status: 'draft' as const,
      updatedAt: new Date().toISOString(),
    };
    pushHistory(updated);
    alert(`Form "${activeForm.title}" saved as draft!`);
  };

  const handleConfigureWorkflow = (audience: AudienceType, _selectedUserIds: string[]) => {
    const updated = {
      ...activeForm,
      approvalConfigured: true,
      updatedAt: new Date().toISOString(),
    };
    pushHistory(updated);
  };

  const handlePublishForm = async (data: {
    audienceType: AudienceType;
    selectedUserIds: string[];
    attachWorkflow: boolean;
    matrixLevels?: any[];
    dueDate: string;
    priority: 'High' | 'Medium' | 'Low';
  }) => {
    setIsWorkflowModalOpen(false);
    const updated = {
      ...activeForm,
      status: 'published' as const,
      approvalConfigured: data.attachWorkflow,
      updatedAt: new Date().toISOString(),
    };
    pushHistory(updated);

    const res = await formWorkflowService.publishForm({
      form: activeForm,
      audienceType: data.audienceType,
      selectedUserIds: data.selectedUserIds,
      attachWorkflow: data.attachWorkflow,
      matrixLevels: data.matrixLevels,
      dueDate: data.dueDate,
      priority: data.priority,
    });

    setSuccessModalData({
      isOpen: true,
      formTitle: activeForm.title,
      recipientCount: res.createdCount,
      audienceType: data.audienceType,
      dueDate: data.dueDate,
      priority: data.priority,
      hasWorkflow: data.attachWorkflow,
    });
  };

  // Currently selected field object
  const selectedField = activeForm.fields.find((f) => f.id === selectedFieldId) || null;

  return (
    <div className="cfb-builder-layout">
      {/* Left Sidebar: Components Palette & Form List Switcher */}
      <FormBuilderSidebar
        forms={forms}
        activeFormId={activeFormId}
        onSelectForm={handleSelectForm}
        onCreateNewForm={handleCreateNewForm}
        onDeleteForm={handleDeleteForm}
        onAddField={handleAddField}
        sidebarTab={sidebarTab}
        setSidebarTab={setSidebarTab}
      />

      {/* Center Builder Canvas & Toolbar */}
      <FormBuilderCanvas
        form={activeForm}
        selectedFieldId={selectedFieldId}
        onSelectField={setSelectedFieldId}
        onUpdateFormHeader={handleUpdateFormHeader}
        onDropField={handleDropField}
        onMoveField={handleMoveField}
        onDuplicateField={handleDuplicateField}
        onDeleteField={handleDeleteField}
        onClearCanvas={handleClearCanvas}
        onSaveForm={handleSaveForm}
        canUndo={history.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Right Properties Panel */}
      <FormBuilderPropertiesPanel
        selectedField={selectedField}
        onUpdateField={handleUpdateField}
        onClose={() => setSelectedFieldId(null)}
      />

      {/* Save Workflow Modal */}
      <FormSaveWorkflowModal
        isOpen={isWorkflowModalOpen}
        onClose={() => setIsWorkflowModalOpen(false)}
        onSaveAsDraft={handleSaveAsDraft}
        onConfigureWorkflow={handleConfigureWorkflow}
        onPublishForm={handlePublishForm}
        formTitle={activeForm.title}
      />

      {/* Form Publish Success Modal */}
      <FormPublishSuccessModal
        isOpen={successModalData.isOpen}
        onClose={() => setSuccessModalData((prev) => ({ ...prev, isOpen: false }))}
        formTitle={successModalData.formTitle}
        recipientCount={successModalData.recipientCount}
        audienceType={successModalData.audienceType}
        dueDate={successModalData.dueDate}
        priority={successModalData.priority}
        hasWorkflow={successModalData.hasWorkflow}
        onCreateAnotherForm={() => {
          setSuccessModalData((prev) => ({ ...prev, isOpen: false }));
          handleCreateNewForm();
        }}
        onViewFormsList={() => {
          setSuccessModalData((prev) => ({ ...prev, isOpen: false }));
          navigate('/admin/forms');
        }}
        onViewResponses={() => {
          setSuccessModalData((prev) => ({ ...prev, isOpen: false }));
          navigate('/admin/form-responses');
        }}
      />
    </div>
  );
}
