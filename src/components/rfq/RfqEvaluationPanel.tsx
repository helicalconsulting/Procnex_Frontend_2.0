import { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Settings,
  GripVertical,
  AlertTriangle,
  BarChart3,
  Edit3,
  Save,
  X,
} from 'lucide-react';
import type { EvalCategory, EvalSubParameter } from '../../types/rfqEvaluation';
import { PREDEFINED_EVAL_CATEGORIES } from '../../mocks/rfqEvaluation.mock';

import './RfqEvaluationPanel.css';

// ─── Types ──────────────────────────────────────────────────

interface RfqEvaluationPanelProps {
  /** Controlled categories; if null, uses predefined defaults */
  categories: EvalCategory[];
  onChange: (categories: EvalCategory[]) => void;
}

interface CategoryWeightEditor {
  open: boolean;
  categoryId: string | null;
}

interface SubParamEditor {
  open: boolean;
  categoryId: string | null;
  subParamId: string | null;
}

// ─── Helpers ────────────────────────────────────────────────

let nextId = 1000;
function uid(prefix = 'sp'): string {
  return `${prefix}-${nextId++}-${Math.random().toString(36).slice(2, 6)}`;
}

function cloneCategories(cats: EvalCategory[]): EvalCategory[] {
  return cats.map((c) => ({ ...c, subParameters: c.subParameters.map((sp) => ({ ...sp })) }));
}

// ─── Component ──────────────────────────────────────────────

export default function RfqEvaluationPanel({
  categories,
  onChange,
}: RfqEvaluationPanelProps) {
  // ── State ──────────────────────────────────────────────
  const [weightEditor, setWeightEditor] = useState<CategoryWeightEditor>({
    open: false,
    categoryId: null,
  });
  const [subParamEditor, setSubParamEditor] = useState<SubParamEditor>({
    open: false,
    categoryId: null,
    subParamId: null,
  });
  const [editName, setEditName] = useState('');
  const [editMaxScore, setEditMaxScore] = useState(10);
  const [editRequired, setEditRequired] = useState(false);
  const [editWeightage, setEditWeightage] = useState(0);
  const [editDescription, setEditDescription] = useState('');
  const [bulkWeightOpen, setBulkWeightOpen] = useState(false);

  const isBusinessReqs = (name: string) => name === 'Business Requirements';

  const totalWeightage = useMemo(
    () =>
      categories
        .filter((c) => c.enabled && !isBusinessReqs(c.name))
        .reduce((s, c) => s + c.weightage, 0),
    [categories]
  );

  // ── Category Handlers ─────────────────────────────────

  const toggleCategory = useCallback(
    (catId: string) => {
      onChange(
        categories.map((c) => (c.id === catId ? { ...c, expanded: !c.expanded } : c))
      );
    },
    [categories, onChange]
  );

  const updateCategoryWeight = useCallback(
    (catId: string, weight: number) => {
      onChange(
        categories.map((c) =>
          c.id === catId ? { ...c, weightage: Math.max(0, Math.min(100, weight)) } : c
        )
      );
    },
    [categories, onChange]
  );

  const toggleCategoryEnabled = useCallback(
    (catId: string) => {
      onChange(
        categories.map((c) => (c.id === catId ? { ...c, enabled: !c.enabled } : c))
      );
    },
    [categories, onChange]
  );

  // ── Sub-Parameter Handlers ─────────────────────────────

  const toggleSubParam = useCallback(
    (catId: string, spId: string, field: 'enabled' | 'required') => {
      onChange(
        categories.map((c) =>
          c.id === catId
            ? {
                ...c,
                subParameters: c.subParameters.map((p) =>
                  p.id === spId ? { ...p, [field]: !p[field] } : p
                ),
              }
            : c
        )
      );
    },
    [categories, onChange]
  );

  const updateSubParamWeight = useCallback(
    (catId: string, spId: string, weight: number) => {
      onChange(
        categories.map((c) =>
          c.id === catId
            ? {
                ...c,
                subParameters: c.subParameters.map((p) =>
                  p.id === spId ? { ...p, weightage: Math.max(0, Math.min(100, weight)) } : p
                ),
              }
            : c
        )
      );
    },
    [categories, onChange]
  );

  const removeSubParam = useCallback(
    (catId: string, spId: string) => {
      onChange(
        categories.map((c) =>
          c.id === catId
            ? { ...c, subParameters: c.subParameters.filter((p) => p.id !== spId) }
            : c
        )
      );
    },
    [categories, onChange]
  );

  const addCustomParameter = useCallback(
    (catId: string) => {
      const newParam: EvalSubParameter = {
        id: uid(),
        name: '',
        source: 'custom',
        enabled: true,
        required: false,
        weightage: 0,
        maxScore: 10,
      };
      onChange(
        categories.map((c) =>
          c.id === catId
            ? { ...c, subParameters: [...c.subParameters, newParam], expanded: true }
            : c
        )
      );
      // Open editor for the new parameter
      setSubParamEditor({ open: true, categoryId: catId, subParamId: newParam.id });
      setEditName('');
      setEditMaxScore(10);
      setEditRequired(false);
      setEditWeightage(0);
      setEditDescription('');
    },
    [categories, onChange]
  );

  const saveSubParamEdit = useCallback(() => {
    if (!subParamEditor.categoryId || !subParamEditor.subParamId) return;
    onChange(
      categories.map((c) =>
        c.id === subParamEditor.categoryId
          ? {
              ...c,
              subParameters: c.subParameters.map((p) =>
                p.id === subParamEditor.subParamId
                  ? {
                      ...p,
                      name: editName || p.name,
                      maxScore: editMaxScore,
                      required: editRequired,
                      weightage: editWeightage,
                      description: editDescription || undefined,
                    }
                  : p
              ),
            }
          : c
      )
    );
    setSubParamEditor({ open: false, categoryId: null, subParamId: null });
  }, [subParamEditor, editName, editMaxScore, editRequired, editWeightage, editDescription, categories, onChange]);

  const openEditSubParam = useCallback(
    (catId: string, param: EvalSubParameter) => {
      setSubParamEditor({ open: true, categoryId: catId, subParamId: param.id });
      setEditName(param.name);
      setEditMaxScore(param.maxScore);
      setEditRequired(param.required);
      setEditWeightage(param.weightage);
      setEditDescription(param.description || '');
    },
    []
  );

  // ── Reset to predefined ────────────────────────────────

  const resetToPredefined = useCallback(() => {
    onChange(cloneCategories(PREDEFINED_EVAL_CATEGORIES));
  }, [onChange]);

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="rfq-eval">
      {/* ─── Header Controls ──────────────────────────────── */}
      <div className="rfq-eval__toolbar">
        <div className="rfq-eval__toolbar-left">
          <span className="rfq-eval__toolbar-title">
            <BarChart3 size={16} />
            Evaluation Categories
          </span>
          <span className="rfq-eval__toolbar-count">
            {categories.filter((c) => c.enabled).length} of {categories.length} enabled
          </span>
        </div>
        <div className="rfq-eval__toolbar-right">
          <button
            className="rfq-eval__btn rfq-eval__btn--ghost"
            onClick={resetToPredefined}
            title="Reset to predefined template"
          >
            <Settings size={14} />
            Reset Template
          </button>
        </div>
      </div>

      {/* ─── Weightage Bar ───────────────────────────────── */}
      <div className="rfq-eval__weightage-bar">
        <div className="rfq-eval__weightage-track">
          {categories
            .filter((c) => c.enabled && !isBusinessReqs(c.name))
            .map((c) => (
              <div
                key={c.id}
                className="rfq-eval__weightage-segment"
                style={{
                  width: `${totalWeightage > 0 ? (c.weightage / totalWeightage) * 100 : 0}%`,
                  backgroundColor: c.weightage > 0 ? 'var(--primary-500)' : 'var(--border)',
                }}
                title={`${c.name}: ${c.weightage}%`}
              />
            ))}
        </div>
        <span
          className={`rfq-eval__weightage-label ${
            totalWeightage > 100
              ? 'rfq-eval__weightage-label--over'
              : totalWeightage === 100
              ? 'rfq-eval__weightage-label--ok'
              : ''
          }`}
        >
          {totalWeightage}% / 100%
        </span>
      </div>

      {/* ─── Categories Accordion ─────────────────────────── */}
      <div className="rfq-eval__accordion">
        {categories.map((cat) => {
          const enabledParams = cat.subParameters.filter((p) => p.enabled);
          const totalSubWeight = enabledParams.reduce((s, p) => s + p.weightage, 0);

          return (
            <div
              key={cat.id}
              className={`rfq-eval__category ${!cat.enabled ? 'rfq-eval__category--disabled' : ''}`}
            >
              {/* ── Category Header ────────────────────────── */}
              <div className="rfq-eval__cat-header" onClick={() => toggleCategory(cat.id)}>
                <button className="rfq-eval__cat-expand">
                  {cat.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className="rfq-eval__cat-info">
                  <span className="rfq-eval__cat-name">{cat.name}</span>
                  <span className="rfq-eval__cat-meta">
                    {cat.subParameters.length} parameters
                  {cat.enabled
                    ? isBusinessReqs(cat.name)
                      ? ' · informational'
                      : ` · ${cat.weightage}% weight`
                    : ' · disabled'}
                  </span>
                </div>
                <div className="rfq-eval__cat-actions" onClick={(e) => e.stopPropagation()}>
                  {/* Weightage — hidden for Business Requirements */}
                  {isBusinessReqs(cat.name) ? (
                    <span className="rfq-eval__informational-badge">
                      Informational Only
                    </span>
                  ) : (
                    <>
                      <input
                        type="number"
                        className="rfq-eval__weight-input"
                        value={cat.weightage}
                        min={0}
                        max={100}
                        onChange={(e) => updateCategoryWeight(cat.id, parseInt(e.target.value) || 0)}
                        title="Category weightage (%)"
                        disabled={!cat.enabled}
                      />
                      <span className="rfq-eval__weight-suffix">%</span>
                    </>
                  )}
                  {/* Enable/Disable */}
                  <button
                    className={`rfq-eval__toggle-btn ${cat.enabled ? 'rfq-eval__toggle-btn--on' : 'rfq-eval__toggle-btn--off'}`}
                    onClick={() => toggleCategoryEnabled(cat.id)}
                    title={cat.enabled ? 'Disable category' : 'Enable category'}
                  >
                    {cat.enabled ? 'On' : 'Off'}
                  </button>
                </div>
              </div>

              {/* ── Category Body (Sub-Parameters) ─────────── */}
              {cat.expanded && (
                <div className="rfq-eval__cat-body">

                  {/* ── Sub-Parameter Weightage Bar ────── */}
                  {!isBusinessReqs(cat.name) && enabledParams.length > 1 && (
                    <div className="rfq-eval__sub-weightage-bar">
                      <div className="rfq-eval__sub-weightage-track">
                        {enabledParams.map((p) => (
                          <div
                            key={p.id}
                            className="rfq-eval__sub-weightage-segment"
                            style={{
                              width: `${totalSubWeight > 0 ? (p.weightage / totalSubWeight) * 100 : 0}%`,
                              backgroundColor: p.weightage > 0 ? 'var(--primary-400)' : 'var(--border)',
                            }}
                            title={`${p.name}: ${p.weightage}%`}
                          />
                        ))}
                      </div>
                      <span
                        className={`rfq-eval__sub-weightage-label ${
                          totalSubWeight > 100
                            ? 'rfq-eval__weightage-label--over'
                            : totalSubWeight === 100
                            ? 'rfq-eval__weightage-label--ok'
                            : 'rfq-eval__weightage-label--under'
                        }`}
                      >
                        {totalSubWeight}% / 100%
                      </span>
                    </div>
                  )}

                  {/* Sub-Parameters List */}
                  {cat.subParameters.map((param) => {
                    const isEditing =
                      subParamEditor.open &&
                      subParamEditor.categoryId === cat.id &&
                      subParamEditor.subParamId === param.id;

                    return (
                      <div
                        key={param.id}
                        className={`rfq-eval__subparam ${!param.enabled ? 'rfq-eval__subparam--disabled' : ''}`}
                      >
                        <div className="rfq-eval__subparam-row">
                          <span className="rfq-eval__subparam-drag">
                            <GripVertical size={12} />
                          </span>

                          {isEditing ? (
                            <div className="rfq-eval__subparam-edit">
                              <input
                                type="text"
                                className="rfq-eval__input rfq-eval__input--sm"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Parameter name"
                                autoFocus
                              />
                              <div className="rfq-eval__subparam-edit-fields">
                                <label className="rfq-eval__subparam-edit-label">
                                  Max Score
                                  <input
                                    type="number"
                                    className="rfq-eval__input rfq-eval__input--xs"
                                    value={editMaxScore}
                                    min={1}
                                    max={100}
                                    onChange={(e) => setEditMaxScore(parseInt(e.target.value) || 1)}
                                  />
                                </label>
                                <label className="rfq-eval__subparam-edit-check">
                                  <input
                                    type="checkbox"
                                    checked={editRequired}
                                    onChange={(e) => setEditRequired(e.target.checked)}
                                  />
                                  Required
                                </label>
                                <input
                                  type="text"
                                  className="rfq-eval__input rfq-eval__input--sm"
                                  value={editDescription}
                                  onChange={(e) => setEditDescription(e.target.value)}
                                  placeholder="Description (optional)"
                                />
                              </div>
                              <div className="rfq-eval__subparam-edit-actions">
                                <button
                                  className="rfq-eval__btn rfq-eval__btn--primary rfq-eval__btn--xs"
                                  onClick={saveSubParamEdit}
                                >
                                  <Save size={12} />
                                  Save
                                </button>
                                <button
                                  className="rfq-eval__btn rfq-eval__btn--ghost rfq-eval__btn--xs"
                                  onClick={() =>
                                    setSubParamEditor({ open: false, categoryId: null, subParamId: null })
                                  }
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="rfq-eval__subparam-info">
                                <span className="rfq-eval__subparam-name">
                                  {param.name || 'Unnamed Parameter'}
                                </span>
                                {param.source === 'predefined' && (
                                  <span className="rfq-eval__subparam-badge rfq-eval__subparam-badge--predef">
                                    Predefined
                                  </span>
                                )}
                                {param.required && (
                                  <span className="rfq-eval__subparam-badge rfq-eval__subparam-badge--required">
                                    Required
                                  </span>
                                )}
                                {param.description && (
                                  <span className="rfq-eval__subparam-desc">{param.description}</span>
                                )}
                              </div>
                              <div className="rfq-eval__subparam-controls">
                                {!isBusinessReqs(cat.name) && (
                                  <div className="rfq-eval__subparam-meta">
                                    <span className="rfq-eval__subparam-score">Max: {param.maxScore}</span>
                                  </div>
                                )}
                                {!isBusinessReqs(cat.name) && (
                                  <>
                                    <input
                                      type="number"
                                      className="rfq-eval__weight-input rfq-eval__weight-input--xs"
                                      value={param.weightage}
                                      min={0}
                                      max={100}
                                      onChange={(e) =>
                                        updateSubParamWeight(cat.id, param.id, parseInt(e.target.value) || 0)
                                      }
                                      title="Sub-parameter weightage (%)"
                                      disabled={!param.enabled}
                                    />
                                    <span className="rfq-eval__weight-suffix">%</span>
                                  </>
                                )}
                                <button
                                  className="rfq-eval__icon-btn"
                                  onClick={() => openEditSubParam(cat.id, param)}
                                  title="Edit parameter"
                                >
                                  <Edit3 size={12} />
                                </button>
                                <button
                                  className={`rfq-eval__toggle-btn rfq-eval__toggle-btn--xs ${param.enabled ? 'rfq-eval__toggle-btn--on' : 'rfq-eval__toggle-btn--off'}`}
                                  onClick={() => toggleSubParam(cat.id, param.id, 'enabled')}
                                  title={param.enabled ? 'Disable' : 'Enable'}
                                >
                                  {param.enabled ? 'On' : 'Off'}
                                </button>
                                {param.source === 'custom' && (
                                  <button
                                    className="rfq-eval__icon-btn rfq-eval__icon-btn--danger"
                                    onClick={() => removeSubParam(cat.id, param.id)}
                                    title="Delete parameter"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>

                      </div>
                    );
                  })}

                  {/* ── Sub-Parameter Weightage Validation ── */}
                  {!isBusinessReqs(cat.name) && enabledParams.length > 0 && totalSubWeight !== 100 && (
                    <div className="rfq-eval__sub-validation">
                      <AlertTriangle size={12} />
                      {totalSubWeight < 100
                        ? `Sub-parameter weightage total is ${totalSubWeight}% — distribute remaining ${100 - totalSubWeight}% among parameters.`
                        : `Sub-parameter weightage total is ${totalSubWeight}% — exceeds 100%. Reduce some parameters.`}
                    </div>
                  )}

                  {/* ── Add Custom Parameter ───────────────── */}
                  <button className="rfq-eval__add-param" onClick={() => addCustomParameter(cat.id)}>
                    <Plus size={13} />
                    Add Your Own Parameter
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Weightage Validation ──────────────────────────── */}
      {totalWeightage !== 100 && (
        <div className="rfq-eval__validation">
          <AlertTriangle size={14} />
          {totalWeightage < 100
            ? `Total category weightage is ${totalWeightage}% — needs to be 100% (Business Requirements is informational, so distribute 100% among the other categories).`
            : `Total category weightage is ${totalWeightage}% — exceeds 100%. Reduce some categories.`}
        </div>
      )}


    </div>
  );
}
