import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { rfqService, type CreateRfqPayload, type EvalCategoryDTO } from '../../services/rfqService';
import { vendorService } from '../../services/vendorService';
import { companySettingsService, type Unit, type FormFieldConfig } from '../../services/companySettingsService';
import {
  ArrowLeft,
  FileText,
  Package,
  Users,
  Plus,
  Trash2,
  Save,
  Send,
  CalendarDays,
  Settings,
  Check,
  Edit3,
  Shield,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import { PageSkeleton, CardSkeleton } from '../../components/shared/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { isL2OrHigherUser } from '../../utils/rbac';
import { CreatorLevelPromptModal } from '../../components/shared/CreatorLevelPromptModal';
import './CreateRFQPage.css';

// ─── Types ──────────────────────────────────────────────────

interface LineItem {
  id: number;
  itemCode?: string;
  itemName: string;
  description: string;
  quantity: string;
  unit: string;
  expectedDate: string;
}  interface VendorOption {
  id: string;
  name: string;
  email: string;
  category: string;
  initials: string;
  avatarMod: string;
  overallScore?: number;
  avgQuality?: number;
  avgDelivery?: number;
}

interface DepartmentOption {
  id: number;
  name: string;
  categories: string[];
}

import type { EvalCategory } from '../../types/rfqEvaluation';
import { createCategory } from '../../types/rfqEvaluation';
import { PREDEFINED_EVAL_CATEGORIES } from '../../mocks/rfqEvaluation.mock';
import RfqEvaluationPanel from '../../components/rfq/RfqEvaluationPanel';

function normalizeMatchValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function vendorMatchesDepartment(vendor: VendorOption, department: DepartmentOption | null) {
  if (!department) return false;
  const category = normalizeMatchValue(vendor.category);
  const dept = normalizeMatchValue(department.name);
  const allowed = department.categories.length > 0 ? department.categories : [department.name];
  return allowed.some((entry) => {
    const expected = normalizeMatchValue(entry);
    return category === expected || category.includes(expected) || (dept.length > 2 && category.includes(dept));
  });
}

function cloneCats(cats: EvalCategory[]): EvalCategory[] {
  return cats.map((c) => ({ ...c, subParameters: c.subParameters.map((sp) => ({ ...sp })) }));
}

function toEvalCategoryDTO(cats: EvalCategory[]): EvalCategoryDTO[] {
  return cats.map((cat) => ({
    name: cat.name,
    weightage: cat.weightage,
    enabled: cat.enabled,
    expanded: cat.expanded,
    sortOrder: cat.sortOrder,
    subParameters: cat.subParameters.map((sp) => ({
      name: sp.name,
      source: sp.source,
      enabled: sp.enabled,
      required: sp.required,
      weightage: sp.weightage,
      maxScore: sp.maxScore,
      description: sp.description,
      sortOrder: sp.sortOrder,
    })),
  }));
}

// ─── Component ──────────────────────────────────────────────

export default function CreateRFQPage() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditing = !!editId;
  const [loadingRfq, setLoadingRfq] = useState(false);
  const { data: availableVendors, loading: vendorsLoading } = useServiceData(
    () =>
      vendorService.list().then((rows) =>
        rows.map((v) => ({
          id: v.id,
          name: v.name,
          email: v.email,
          category: v.category,
          initials: v.initials,
          avatarMod: String(v.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 6 + 1),
          overallScore: v.overallScore,
          avgQuality: v.avgQuality,
          avgDelivery: v.avgDelivery,
        }))
      ),
    [] as VendorOption[],
    [],
    { cacheTtlMs: 30000 }
  );

  // Dynamic departments from backend
  const { data: departments } = useServiceData(
    () => companySettingsService.listDepartments().then((deps) =>
      deps.map((d) => ({
        id: d.id,
        name: d.name,
        categories: (d.categories || []).map((c: { name: string }) => c.name),
      }))
    ),
    [] as DepartmentOption[],
    [],
    { cacheTtlMs: 120000 }
  );
  // Dynamic units from backend
  const { data: unitOptions } = useServiceData(
    () => companySettingsService.listUnits().then((units) => units.map((u) => u.name)),
    [] as string[],
    [],
    { cacheTtlMs: 120000 }
  );

  // Pre-configured RFQ Flexi Fields from Company Settings
  const { data: preconfiguredRfqFields } = useServiceData(
    () => companySettingsService.listFormFieldConfigs('rfq_information'),
    [] as FormFieldConfig[],
    [],
    { cacheKey: 'form-configs:rfq_information' }
  );

  // Fallback if no units configured yet
  const UNIT_OPTIONS = useMemo(() => unitOptions.length > 0 ? unitOptions : ['Pcs', 'Kg', 'Ltr', 'Mtr', 'Box', 'Set', 'Nos', 'Pair'], [unitOptions]);

  const [isEditLocked, setIsEditLocked] = useState(false);

  // Load existing RFQ data when editing
  useEffect(() => {
    if (!editId) return;
    setLoadingRfq(true);
    Promise.all([
      rfqService.getById(editId),
      rfqService.getEvaluationCategories(editId).catch(() => null),
    ]).then(([rfq, evalCats]) => {
      if (!rfq) return;

      const currentUserId = String(user?.id || (user as any)?._id || '');
      const creatorId = String((rfq as any).createdBy || (rfq as any).creatorId || (rfq as any).creator?.id || '');
      const isOriginator = creatorId ? creatorId === currentUserId : true;

      if (rfq.status === 'PENDING_APPROVAL' && !isOriginator) {
        setIsEditLocked(true);
        setSubmitError(`RFQ #${rfq.rfqNumber} is currently under approval workflow. Only the originator (${rfq.creator || 'Originator'}) can edit it.`);
      }

      setTitle(rfq.title);
      setDescription(rfq.description);
      setPriority(rfq.priority || 'Medium');
      setDepartment(rfq.department || '');
      setClosingDate(rfq.closingDate || '');
      // Load Bid Security data
      if ((rfq as any).bidSecurityRequired) {
        setBidSecurityEnabled(true);
        setBidSecurityExpanded(true);
        if ((rfq as any).bidSecurityMinValue != null) setBidSecurityMinValue(String((rfq as any).bidSecurityMinValue));
        if ((rfq as any).bidSecurityMinCurrency != null) setBidSecurityMinCurrency((rfq as any).bidSecurityMinCurrency);
        if ((rfq as any).bidSecurityMinValidity != null) setBidSecurityMinValidity(String((rfq as any).bidSecurityMinValidity));
      }
      if ((rfq as any).bidBondRequired) {
        setBidBondEnabled(true);
        setBidSecurityExpanded(true);
        if ((rfq as any).bidBondMinValue != null) setBidBondMinValue(String((rfq as any).bidBondMinValue));
        if ((rfq as any).bidBondMinCurrency != null) setBidBondMinCurrency((rfq as any).bidBondMinCurrency);
        if ((rfq as any).bidBondMinValidity != null) setBidBondMinValidity(String((rfq as any).bidBondMinValidity));
      }
      if ((rfq as any).rfqApprovalStartPoint) setRfqApprovalStartPoint((rfq as any).rfqApprovalStartPoint);
      if ((rfq as any).quotationApprovalMode) setQuotationApprovalMode((rfq as any).quotationApprovalMode);
      if ((rfq as any).quotationXUserRole) setQuotationXUserRole((rfq as any).quotationXUserRole);
      setRfqMode(rfq.rfqType === 'TENDER' || rfq.rfqType === 'CUSTOM' ? 'TENDER' : 'RFQ');
      if (rfq.customFields && rfq.customFields.length > 0) {
        setCustomFields(rfq.customFields.map((cf: { id: string; fieldName: string; fieldType: string; required: boolean; weightage?: number }) => ({
          id: cf.id,
          fieldName: cf.fieldName,
          fieldType: cf.fieldType as 'number' | 'data' | 'attachment' | 'alphanumeric' | 'alphabetical',
          required: cf.required,
          weightage: (cf as any).weightage ?? 0,
        })));
      }

      // Load Simple RFQ weightages from evaluationParameters so edits persist on refresh
      if (rfq.rfqType !== 'TENDER' && rfq.rfqType !== 'CUSTOM') {
        const evalParams = (rfq as any).evaluationParameters as
          | Array<{ parameterName: string; parameterType: string; weightage: number; active: boolean; sortOrder: number }>
          | undefined;
        if (evalParams && evalParams.length > 0) {
          const weightages: Record<string, { label: string; weightage: number }> = {};
          const sysKeys = ['price', 'vendorRating', 'delivery', 'compliance'];
          for (const ep of evalParams) {
            if (ep.sortOrder >= 0 && ep.sortOrder < sysKeys.length) {
              weightages[sysKeys[ep.sortOrder]] = { label: ep.parameterName, weightage: ep.weightage };
            }
          }
          if (Object.keys(weightages).length > 0) {
            setSimpleWeightages((prev) => ({ ...prev, ...weightages }));
          }
        }
      }

      if ((rfq.rfqType === 'TENDER' || rfq.rfqType === 'CUSTOM') && evalCats && evalCats.length > 0) {
        setEvalCategories(evalCats.map((cat: import('../../services/rfqService').EvalCategoryDTO) => ({
          id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${cat.name}`,
          name: cat.name,
          weightage: cat.weightage,
          enabled: cat.enabled,
          expanded: false,
          subParameters: (cat.subParameters || []).map((sp: any) => ({
            id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${sp.name}`,
            name: sp.name,
            source: sp.source || 'custom',
            enabled: sp.enabled,
            required: sp.required,
            weightage: sp.weightage,
            maxScore: sp.maxScore,
            description: sp.description,
          })),
        })));
      }
      if (rfq.lineItems.length > 0) {
        setItems(rfq.lineItems.map((item) => ({
          id: Number(item.id) || Date.now(),
          itemCode: (item as any).itemCode || '',
          itemName: item.itemName,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          expectedDate: item.expectedDate || '',
        })));
      }
      if (rfq.vendors.length > 0) {
        setSelectedVendors(rfq.vendors.map((v) => v.id));
      }
    }).catch((err) => {
      setSubmitError(err instanceof Error ? err.message : 'Failed to load RFQ');
    }).finally(() => {
      setLoadingRfq(false);
    });
  }, [editId]);

  const { roles, hasPermission } = useAuth();
  const canCreateRFQ = hasPermission('RFQ Management', 'canCreate') || hasPermission('RFQ', 'canCreate');
  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showLevelPrompt, setShowLevelPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<'draft' | 'submit' | null>(null);
  const [approvalSubmittedRfq, setApprovalSubmittedRfq] = useState<{ number: string; levelNumber: number; isApprovalChain?: boolean; vendorCount?: number } | null>(null);

  const [simpleWeightageError, setSimpleWeightageError] = useState<string | null>(null);

  // ── RFQ Mode: Simple vs Custom ──
  const [rfqMode, setRfqMode] = useState<'RFQ' | 'TENDER'>('RFQ');

  // ── Simple RFQ: Custom Fields (Additional Vendor Information) ──
  interface CustomField {
    id: string;
    fieldName: string;
    fieldType: 'number' | 'data' | 'attachment' | 'alphanumeric' | 'alphabetical';
    required: boolean;
    weightage: number;
  }

  const { companyDefaultCurrency } = useCurrency();

  // ── Bid Security State ────────────────────────────────
  const [bidSecurityEnabled, setBidSecurityEnabled] = useState(false);
  const [bidBondEnabled, setBidBondEnabled] = useState(false);
  const [bidSecurityExpanded, setBidSecurityExpanded] = useState(false);
  // Min value/validity — buyer sets requirements
  const [bidSecurityMinValue, setBidSecurityMinValue] = useState('');
  const [bidSecurityMinCurrency, setBidSecurityMinCurrency] = useState(companyDefaultCurrency);
  const [bidSecurityMinValidity, setBidSecurityMinValidity] = useState('');
  const [bidBondMinValue, setBidBondMinValue] = useState('');
  const [bidBondMinCurrency, setBidBondMinCurrency] = useState(companyDefaultCurrency);
  const [bidBondMinValidity, setBidBondMinValidity] = useState('');

  // ── Approval & Workflow Settings State ─────────────────
  const [rfqApprovalStartPoint, setRfqApprovalStartPoint] = useState<'ORIGINATOR' | 'L1_USER'>('L1_USER');
  const [quotationApprovalMode, setQuotationApprovalMode] = useState<'DIRECT_X_ONLY' | 'FULL_CHAIN'>('DIRECT_X_ONLY');
  const [quotationXUserRole, setQuotationXUserRole] = useState('L1 User');

  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const addCustomField = useCallback(() => {
    setCustomFields((prev) => [
      ...prev,
      { id: `cf_${Date.now()}`, fieldName: '', fieldType: 'text', required: false, weightage: 0 },
    ]);
  }, []);



  const removeCustomField = useCallback((id: string) => {
    setCustomFields((prev) => prev.filter((cf) => cf.id !== id));
  }, []);

  const updateCustomField = useCallback((id: string, field: Partial<CustomField>) => {
    setCustomFields((prev) => prev.map((cf) => (cf.id === id ? { ...cf, ...field } : cf)));
  }, []);

  // ── RFQ Info: Extra Fields from Settings (Flexi Fields) ──
  interface InfoExtraField {
    id: string;
    fieldKey: string;
    label: string;
    fieldType: string;
    value: string;
  }
  const [infoExtraFields, setInfoExtraFields] = useState<InfoExtraField[]>([]);
  const [showInfoFieldMenu, setShowInfoFieldMenu] = useState(false);

  const addInfoExtraField = useCallback((field: FormFieldConfig) => {
    setInfoExtraFields((prev) => [
      ...prev,
      { id: `ief_${Date.now()}`, fieldKey: field.fieldKey, label: field.label, fieldType: field.fieldType, value: '' },
    ]);
    setShowInfoFieldMenu(false);
  }, []);

  const removeInfoExtraField = useCallback((id: string) => {
    setInfoExtraFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateInfoExtraFieldValue = useCallback((id: string, value: string) => {
    setInfoExtraFields((prev) => prev.map((f) => (f.id === id ? { ...f, value } : f)));
  }, []);

  // Close the Add Field menu when clicking outside
  useEffect(() => {
    if (!showInfoFieldMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.create-rfq__add-field-container')) {
        setShowInfoFieldMenu(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handler);
    };
  }, [showInfoFieldMenu]);


  // ── Simple RFQ: Scoring Weightages ──
  const DEFAULT_SIMPLE_WEIGHTAGES = {
    price: { label: 'Pricing', weightage: 50 },
    vendorRating: { label: 'Quality', weightage: 20 },
    delivery: { label: 'Delivery Time', weightage: 15 },
    compliance: { label: 'Compliance', weightage: 15 },
  };

  const [simpleWeightages, setSimpleWeightages] = useState<Record<string, { label: string; weightage: number }>>(
    () => ({ ...DEFAULT_SIMPLE_WEIGHTAGES })
  );

  // Load saved weightage preferences from DB for new RFQ
  // Falls back to latest Simple RFQ parameters, then defaults
  useEffect(() => {
    if (isEditing) return;
    let cancelled = false;
    rfqService.getWeightagePreferences().then((prefs) => {
      if (cancelled) return;
      if (prefs && Object.keys(prefs).length > 0) {
        setSimpleWeightages(prefs);
        return;
      }
      // Fallback to latest Simple RFQ params
      rfqService.getLatestSimpleParams().then((params) => {
        if (cancelled || !params || params.length === 0) return;
        const weightages: Record<string, { label: string; weightage: number }> = {};
        const sysKeys = ['price', 'vendorRating', 'delivery', 'compliance'];
        for (const ep of params) {
          if (ep.sortOrder >= 0 && ep.sortOrder < sysKeys.length) {
            weightages[sysKeys[ep.sortOrder]] = { label: ep.parameterName, weightage: ep.weightage };
          }
        }
        if (Object.keys(weightages).length > 0) {
          setSimpleWeightages(weightages);
        }
      }).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isEditing]);

  // ── Save weightage preferences to DB ──
  const [savingWeightages, setSavingWeightages] = useState(false);
  const [weightagesSaved, setWeightagesSaved] = useState(false);

  const handleSaveWeightages = useCallback(async () => {
    setSavingWeightages(true);
    setWeightagesSaved(false);
    try {
      await rfqService.saveWeightagePreferences(simpleWeightages);
      setWeightagesSaved(true);
      setTimeout(() => setWeightagesSaved(false), 2000);
    } catch {
      setSubmitError('Failed to save weightage preferences');
    } finally {
      setSavingWeightages(false);
    }
  }, [simpleWeightages]);

  // Also save weightage preferences when saving/submitting the full RFQ
  // (added inside handleSaveDraft and handleSubmit below)

  // ── Dynamic Category Addition (for Enterprise Evaluation) ──
  const addCategoryToEval = useCallback(() => {
    setEvalCategories((prev) => [
      ...prev,
      createCategory(`Category ${prev.length + 1}`),
    ]);
  }, []);



  const simpleWeightageTotal = useMemo(
    () =>
      Object.values(simpleWeightages).reduce((sum, p) => sum + p.weightage, 0) +
      customFields.filter((cf) => cf.fieldName.trim()).reduce((sum, cf) => sum + cf.weightage, 0),
    [simpleWeightages, customFields]
  );

  const updateSimpleWeightage = useCallback((key: string, weightage: number) => {
    setSimpleWeightages((prev) => ({
      ...prev,
      [key]: { ...prev[key], weightage: Math.max(0, Math.min(100, weightage)) },
    }));
  }, []);

  // ── Edit weightage label ──
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const startEditWeightage = useCallback((key: string, label: string) => {
    setEditingKey(key);
    setEditingLabel(label);
  }, []);

  const saveEditWeightage = useCallback(() => {
    if (!editingKey || !editingLabel.trim()) return;
    setSimpleWeightages((prev) => ({
      ...prev,
      [editingKey]: { ...prev[editingKey], label: editingLabel.trim() },
    }));
    setEditingKey(null);
    setEditingLabel('');
  }, [editingKey, editingLabel]);

  const cancelEditWeightage = useCallback(() => {
    setEditingKey(null);
    setEditingLabel('');
  }, []);

  // ── Delete weightage ──
  const deleteWeightage = useCallback((key: string) => {
    setSimpleWeightages((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // ── Reset weightages to defaults ──
  const resetSimpleWeightages = useCallback(() => {
    setSimpleWeightages({ ...DEFAULT_SIMPLE_WEIGHTAGES });
  }, []);

  // Form state — RFQ Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [department, setDepartment] = useState('');
  const [closingDate, setClosingDate] = useState('');

  // Form state — Line Items
  const [items, setItems] = useState<LineItem[]>([
    { id: 1, itemCode: '', itemName: '', description: '', quantity: '', unit: '', expectedDate: '' },
  ]);

  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      { id: Date.now(), itemCode: '', itemName: '', description: '', quantity: '', unit: '', expectedDate: '' },
    ]);
  }, []);

  const removeItem = useCallback((id: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  }, []);

  const updateItem = useCallback((id: number, field: keyof LineItem, value: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  }, []);

  // Form state — Vendors
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const selectedDepartment = useMemo(
    () => departments.find((d) => d.name === department) || null,
    [departments, department]
  );

  const departmentVendors = useMemo(
    () => availableVendors.filter((vendor) => vendorMatchesDepartment(vendor, selectedDepartment)),
    [availableVendors, selectedDepartment]
  );

  useEffect(() => {
    const visibleVendorIds = new Set(departmentVendors.map((vendor) => vendor.id));
    setSelectedVendors((prev) => prev.filter((vendorId) => visibleVendorIds.has(vendorId)));
  }, [departmentVendors]);

  const toggleVendor = useCallback((vendorId: string) => {
    setSelectedVendors((prev) =>
      prev.includes(vendorId)
        ? prev.filter((id) => id !== vendorId)
        : [...prev, vendorId]
    );
  }, []);

  // ── Evaluation Categories ──
  const [evalCategories, setEvalCategories] = useState<EvalCategory[]>(() => cloneCats(PREDEFINED_EVAL_CATEGORIES));

  const isBusinessReqs = (name: string) => name === 'Business Requirements';

  // ── Pure function: proportionally scale weightages to total 100% ──
  function normalizeCategoryWeightages(cats: EvalCategory[]): EvalCategory[] {
    const total = cats.reduce((sum, c) => {
      if (c.enabled && !isBusinessReqs(c.name)) return sum + c.weightage;
      return sum;
    }, 0);

    if (total === 0) return cats;

    const factor = 100 / total;
    const newCats = cats.map((c) => {
      if (!c.enabled || isBusinessReqs(c.name)) return c;
      return { ...c, weightage: Math.round(c.weightage * factor * 10) / 10 };
    });

    // Fix rounding so total is exactly 100
    const newTotal = newCats.reduce((sum, c) => {
      if (c.enabled && !isBusinessReqs(c.name)) return sum + c.weightage;
      return sum;
    }, 0);

    const diff = Math.round((100 - newTotal) * 10) / 10;
    if (Math.abs(diff) > 0.01) {
      const maxCat = newCats.reduce((max, c) =>
        c.enabled && !isBusinessReqs(c.name) && c.weightage > max.weightage ? c : max
      , newCats[0]);
      const maxIdx = newCats.findIndex((c) => c.id === maxCat.id);
      newCats[maxIdx] = { ...newCats[maxIdx], weightage: Math.round((newCats[maxIdx].weightage + diff) * 10) / 10 };
    }

    return newCats;
  }

  // Category-level weightage validation is intentionally skipped.
  // Backend computeEnterpriseEvaluation normalizes scores regardless of total.
  // Sub-parameter weightage validation is handled by RfqEvaluationPanel internally.

  const buildPayload = useCallback((
    startLevelNumber?: number,
    overrideStartPoint?: 'ORIGINATOR' | 'L1_USER',
    overrideQuotationMode?: 'DIRECT_X_ONLY' | 'FULL_CHAIN'
  ): CreateRfqPayload | null => {
    if (!title.trim()) return null;
    const validItems = items.filter((i) => i.itemName.trim() && i.quantity);
    if (!validItems.length) return null;
    if (validItems.some((i) => !i.unit.trim())) return null;

    const enabledCats = normalizeCategoryWeightages(
      evalCategories.filter((c) => c.enabled && c.weightage > 0)
    );

    return {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      department: department || undefined,
      departmentId: selectedDepartment?.id,
      closingDate: closingDate || undefined,
      currency: companyDefaultCurrency,
      rfqType: rfqMode === 'TENDER' ? 'TENDER' : 'RFQ',
      startLevelNumber,
      rfqApprovalStartPoint: overrideStartPoint || rfqApprovalStartPoint,
      quotationApprovalMode: overrideQuotationMode || quotationApprovalMode,
      quotationXUserRole,
      items: validItems.map((i) => ({
        itemCode: i.itemCode?.trim() || undefined,
        itemName: i.itemName.trim(),
        description: i.description.trim() || undefined,
        quantity: parseInt(i.quantity, 10) || 1,
        unit: i.unit,
        expectedDate: i.expectedDate || undefined,
      })),
      vendorIds: selectedVendors.length ? selectedVendors : undefined,
      customFields: rfqMode === 'RFQ' && customFields.length > 0
        ? customFields.filter((cf) => cf.fieldName.trim()).map((cf) => ({
            fieldName: cf.fieldName.trim(),
            fieldType: cf.fieldType,
            required: cf.required,
            weightage: cf.weightage,
          }))
        : undefined,


      evaluationParameters: (() => {
        if (rfqMode === 'RFQ') {
          return [
            ...Object.entries(simpleWeightages).map(([key, param]) => ({
              parameterName: param.label,
              parameterType: 'system' as const,
              weightage: param.weightage,
              active: true,
              sortOrder: ['price', 'vendorRating', 'delivery', 'compliance'].indexOf(key),
            })),
            ...customFields
              .filter((cf) => cf.fieldName.trim() && cf.weightage > 0)
              .map((cf, i) => ({
                parameterName: cf.fieldName.trim(),
                parameterType: 'custom' as const,
                weightage: cf.weightage,
                active: true,
                sortOrder: 10 + i,
              })),
          ];
        }

        if (rfqMode === 'TENDER' && enabledCats.length) {
          return enabledCats.flatMap((cat) =>
            cat.subParameters
              .filter((p) => p.enabled)
              .map((p) => ({
                parameterName: `${cat.name} > ${p.name}`,
                parameterType: p.source === 'predefined' ? 'system' : 'custom',
                weightage: cat.weightage,
                active: true,
              }))
          );
        }

        return undefined;
      })(),            evaluationCategories: rfqMode === 'TENDER' && enabledCats.length
        ? toEvalCategoryDTO(enabledCats)
        : undefined,
      // Bid Security — customer just says what's required, vendor fills details
      bidSecurityRequired: bidSecurityEnabled || undefined,
      bidBondRequired: bidBondEnabled || undefined,
      bidSecurityMinValue: bidSecurityMinValue ? parseFloat(bidSecurityMinValue) : undefined,
      bidSecurityMinCurrency: bidSecurityMinCurrency || undefined,
      bidSecurityMinValidity: bidSecurityMinValidity ? parseInt(bidSecurityMinValidity, 10) : undefined,
      bidBondMinValue: bidBondMinValue ? parseFloat(bidBondMinValue) : undefined,
      bidBondMinCurrency: bidBondMinCurrency || undefined,
      bidBondMinValidity: bidBondMinValidity ? parseInt(bidBondMinValidity, 10) : undefined,
    };
  }, [title, description, priority, department, selectedDepartment, closingDate, companyDefaultCurrency, items, selectedVendors, evalCategories, rfqMode, customFields, infoExtraFields, simpleWeightages, bidSecurityMinValue, bidSecurityMinCurrency, bidSecurityMinValidity, bidBondMinValue, bidBondMinCurrency, bidBondMinValidity, rfqApprovalStartPoint, quotationApprovalMode, quotationXUserRole]);


  const saveEvalCategories = useCallback(async (rfqId: string) => {
    if (rfqMode === 'TENDER') {
      await rfqService.saveEvaluationCategories(rfqId, toEvalCategoryDTO(normalizeCategoryWeightages(evalCategories)));
    } else {
      await rfqService.saveEvaluationCategories(rfqId, []);
    }
  }, [evalCategories, rfqMode]);

  const syncVendors = async (rfqId: string, newVendorIds: string[]) => {
    const current = await rfqService.getById(rfqId);
    const currentIds = current?.vendors.map((v) => v.id) || [];
    const toRemove = currentIds.filter((id) => !newVendorIds.includes(id));
    const toAdd = newVendorIds.filter((id) => !currentIds.includes(id));
    for (const vid of toRemove) {
      await rfqService.removeVendor(rfqId, vid);
    }
    if (toAdd.length > 0) {
      await rfqService.addVendors(rfqId, toAdd);
    }
  };

  const validateSimpleWeightage = useCallback((): boolean => {
    if (Math.abs(simpleWeightageTotal - 100) > 0.01) {
      const diff = 100 - simpleWeightageTotal;
      const msg = simpleWeightageTotal > 100
        ? `RFQ weightage total is ${simpleWeightageTotal}% — exceeds 100%. Reduce some weightages.`
        : `RFQ weightage total is ${simpleWeightageTotal}% — needs to be exactly 100%. Distribute remaining ${diff.toFixed(0)}% among parameters.`;
      setSimpleWeightageError(msg);
      return false;
    }
    return true;
  }, [simpleWeightageTotal]);

  const handleSaveDraft = async () => {
    setPendingAction('draft');
    setShowLevelPrompt(true);
  };

  const executeSaveDraft = async (
    startLevelNumber?: number,
    startPoint?: 'ORIGINATOR' | 'L1_USER',
    mode?: 'DIRECT_X_ONLY' | 'FULL_CHAIN'
  ) => {
    setSimpleWeightageError(null);
    if (rfqMode === 'RFQ' && !validateSimpleWeightage()) return;
    const payload = buildPayload(startLevelNumber, startPoint, mode);
    if (!payload) {
      setSubmitError('Enter a title, unit, and at least one line item with quantity.');
      return;
    }
    setSavingDraft(true);
    setSubmitError(null);
    try {
      if (isEditing && editId) {
        await rfqService.update(editId, { ...payload, isDraft: true });
        await saveEvalCategories(editId);
        if (payload.vendorIds) {
          await syncVendors(editId, payload.vendorIds);
        }
        setSuccessMsg('RFQ draft updated successfully!');
      } else {
        const created = await rfqService.create({ ...payload, isDraft: true });
        const createdId = (created as { id?: string })?.id;
        if (createdId) {
          await saveEvalCategories(createdId);
        }
        setSuccessMsg('RFQ saved as draft successfully!');
      }
      await rfqService.saveWeightagePreferences(simpleWeightages).catch(() => {});
      setTimeout(() => navigate('/rfq'), 1200);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save RFQ');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    setPendingAction('submit');
    setShowLevelPrompt(true);
  };

  const executeSubmit = async (
    startLevelNumber?: number,
    startPoint?: 'ORIGINATOR' | 'L1_USER',
    mode?: 'DIRECT_X_ONLY' | 'FULL_CHAIN'
  ) => {
    setSimpleWeightageError(null);
    if (rfqMode === 'RFQ' && !validateSimpleWeightage()) return;
    const payload = buildPayload(startLevelNumber, startPoint, mode);
    if (!payload) {
      setSubmitError('Enter a title, unit, and at least one line item with quantity.');
      return;
    }
    if (!selectedVendors.length) {
      setSubmitError('Select at least one vendor to send invitation emails.');
      return;
    }
    setSendingEmail(true);
    setSubmitError(null);
    try {
      let rfqResult: any;
      if (isEditing && editId) {
        rfqResult = await rfqService.update(editId, { ...payload, vendorIds: selectedVendors, isDraft: false });
        await saveEvalCategories(editId);
        await syncVendors(editId, selectedVendors);
      } else {
        rfqResult = await rfqService.create({ ...payload, vendorIds: selectedVendors, isDraft: false });
        const createdId = (rfqResult as { id?: string })?.id;
        if (!createdId) throw new Error('RFQ created but no id returned');
        await saveEvalCategories(createdId);
      }
      await rfqService.saveWeightagePreferences(simpleWeightages).catch(() => {});

      const rfqStatus = rfqResult?.status;
      const rfqNum = rfqResult?.rfqNumber || payload.rfqNumber || 'RFQ';
      const isOriginatorSkip = (startPoint || rfqApprovalStartPoint) === 'ORIGINATOR';

      // If internal approval workflow is active and RFQ is PENDING_APPROVAL and NOT ORIGINATOR skip
      if (rfqStatus === 'PENDING_APPROVAL' && !isOriginatorSkip) {
        setApprovalSubmittedRfq({
          number: rfqNum,
          levelNumber: startLevelNumber || 1,
          isApprovalChain: true,
        });
        return;
      }

      // If status is not already SENT (backend auto-dispatches on ORIGINATOR self-approval), send to vendors
      if (rfqStatus !== 'SENT') {
        const sendResult = await rfqService.send(rfqResult.id || editId).catch(() => null);
        if (sendResult?.emailFailures?.length) {
          setSubmitError(
            `RFQ created and sent, but some emails failed: ${sendResult.emailFailures.join('; ')}.`
          );
          return;
        }
      }

      setApprovalSubmittedRfq({
        number: rfqNum,
        levelNumber: 1,
        isApprovalChain: false,
        vendorCount: selectedVendors.length,
      });
    } catch (err) {
      const isOriginatorSkip = (startPoint || rfqApprovalStartPoint) === 'ORIGINATOR';
      const msg = err instanceof Error ? err.message : 'Failed to submit RFQ';
      if ((msg.includes('PENDING_APPROVAL') || msg.includes('APPROVAL_REQUIRED')) && !isOriginatorSkip) {
        setApprovalSubmittedRfq({
          number: payload.rfqNumber || 'RFQ',
          levelNumber: startLevelNumber || 1,
          isApprovalChain: true,
        });
      } else {
        setSubmitError(msg);
      }
    } finally {
      setSendingEmail(false);
    }
  };

  if (loadingRfq) {
    return <PageSkeleton />;
  }

  return (
    <div className="create-rfq">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="create-rfq__header">
        <button className="create-rfq__back" onClick={() => navigate('/rfq')}>
          <ArrowLeft size={18} />
        </button>          <div className="create-rfq__header-text">
            <h1>{isEditing ? 'Edit RFQ' : 'Create New RFQ'}</h1>
            <p>{isEditing ? 'Update the RFQ details, items, or vendors' : 'Fill in the details to create a new Request for Quotation'}</p>
          </div>

          {/* ── Mode Toggle ── */}
          <div className="create-rfq__mode-tabs">
            <button
              className={`create-rfq__mode-btn ${rfqMode === 'RFQ' ? 'create-rfq__mode-btn--active' : ''}`}
              onClick={() => setRfqMode('RFQ')}
            >
              <FileText size={14} />
              RFQ
            </button>
            <button
              className={`create-rfq__mode-btn ${rfqMode === 'TENDER' ? 'create-rfq__mode-btn--active' : ''}`}
              onClick={() => setRfqMode('TENDER')}
            >
              <Settings size={14} />
              Tender
            </button>
          </div>
        </div>

      {/* ── RFQ Details ──────────────────────────────────── */}
      <div className="create-rfq__card">
        <div className="create-rfq__card-header">
          <FileText size={18} />
          RFQ Information
        </div>
        <div className="create-rfq__card-body">
          <div className="create-rfq__form-grid">
            <div className="create-rfq__field create-rfq__field--full">
              <label className="create-rfq__label">
                Title <span className="create-rfq__label-required">*</span>
              </label>
              <input
                className="create-rfq__input"
                type="text"
                placeholder="e.g. Office Furniture Procurement — Q2 2024"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="create-rfq__field create-rfq__field--full">
              <label className="create-rfq__label">Description</label>
              <textarea
                className="create-rfq__textarea"
                placeholder="Provide a detailed description of the procurement requirement..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="create-rfq__field">
              <label className="create-rfq__label">
                Priority <span className="create-rfq__label-required">*</span>
              </label>
              <select
                className="create-rfq__select"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div className="create-rfq__field">
              <label className="create-rfq__label">
                Department <span className="create-rfq__label-required">*</span>
              </label>
              <select
                className="create-rfq__select"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option value="">Select department</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>{dept.name}</option>
                ))}
              </select>
            </div>

            <div className="create-rfq__field">
              <label className="create-rfq__label">
                Closing Date <span className="create-rfq__label-required">*</span>
              </label>
              <input
                className="create-rfq__input"
                type="date"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
              />
              <span className="create-rfq__hint">Last date for vendors to submit quotations</span>
            </div>

            {/* ── Extra Fields from Settings ── */}
            {infoExtraFields.map((ef) => (
              <div key={ef.id} className="create-rfq__field">
                <label className="create-rfq__label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  {ef.label === '' ? (
                    <input
                      type="text"
                      autoFocus
                      placeholder="Field label..."
                      style={{
                        flex: 1,
                        padding: '2px 6px',
                        border: 'none',
                        borderBottom: '1px solid var(--primary-500)',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                      onChange={(e) =>
                        setInfoExtraFields((prev) =>
                          prev.map((f) => (f.id === ef.id ? { ...f, label: e.target.value } : f))
                        )
                      }
                    />
                  ) : (
                    <span>{ef.label}</span>
                  )}
                  <button
                    onClick={() => removeInfoExtraField(ef.id)}
                    title="Remove field"
                    style={{
                      width: 20, height: 20, borderRadius: 'var(--radius-sm)',
                      border: 'none', background: 'transparent',
                      color: 'var(--text-placeholder)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0, flexShrink: 0,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#dc2626'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-placeholder)'}
                  >
                    <Trash2 size={12} />
                  </button>
                </label>
                {ef.fieldType === 'file' || ef.fieldType === 'attachment' ? (
                  <input
                    className="create-rfq__input"
                    type="file"
                    onChange={(e) => updateInfoExtraFieldValue(ef.id, e.target.files?.[0]?.name || '')}
                  />
                ) : ef.fieldType === 'number' ? (
                  <input
                    className="create-rfq__input"
                    type="number"
                    value={ef.value}
                    placeholder={`Enter ${ef.label.toLowerCase() || 'value'}`}
                    onChange={(e) => updateInfoExtraFieldValue(ef.id, e.target.value)}
                  />
                ) : (
                  <input
                    className="create-rfq__input"
                    type="text"
                    value={ef.value}
                    placeholder={`Enter ${ef.label.toLowerCase() || 'value'}`}
                    onChange={(e) => updateInfoExtraFieldValue(ef.id, e.target.value)}
                  />
                )}
              </div>
            ))}

            {/* ── Add Field Button (inside grid, full-width row) ── */}
            <div className="create-rfq__field create-rfq__field--full" style={{ paddingTop: 4 }}>
              <div className="create-rfq__add-field-container" style={{ position: 'relative', display: 'inline-block' }}>
                <button

                  onClick={(e) => { e.stopPropagation(); setShowInfoFieldMenu((v) => !v); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 0', border: 'none', background: 'transparent',
                    color: 'var(--primary-500)', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <Plus size={14} />
                  Add Field
                </button>

                {showInfoFieldMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      zIndex: 1000,
                      background: 'var(--surface-card, #1e2530)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
                      minWidth: 280,
                      maxHeight: 320,
                      overflowY: 'auto',
                    }}
                  >
                    {/* Case 1: No fields configured in Settings */}
                    {preconfiguredRfqFields.length === 0 && (
                      <div style={{
                        padding: '24px 18px',
                        textAlign: 'center',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%',
                          background: 'var(--surface-elevated, #1a2029)',
                          border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Plus size={18} style={{ color: 'var(--text-placeholder)' }} />
                        </div>
                        <div>
                          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                            No field is created yet
                          </p>
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            Go to <strong>Settings → Form Fields</strong> to create fields for RFQ Information.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Case 2: Fields exist — list them */}
                    {preconfiguredRfqFields.length > 0 && (
                      <>
                        <div style={{
                          padding: '10px 14px 8px',
                          fontSize: 12, fontWeight: 700,
                          color: 'var(--text-placeholder)',
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          Form Settings Fields
                        </div>
                        {preconfiguredRfqFields
                          .filter((f) => !infoExtraFields.some((ef) => ef.fieldKey === f.fieldKey))
                          .map((f) => (
                            <button
                              key={f.fieldKey}
                              onClick={() => addInfoExtraField(f)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                width: '100%', padding: '10px 14px',
                                border: 'none', borderBottom: '1px solid var(--border)',
                                background: 'transparent',
                                color: 'var(--text-primary)', fontSize: 14,
                                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover, rgba(255,255,255,0.06))')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              <span style={{
                                width: 26, height: 26, borderRadius: 'var(--radius-sm)',
                                background: 'rgba(10,110,209,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              }}>
                                <Plus size={13} style={{ color: 'var(--primary-500)' }} />
                              </span>
                              <span style={{ flex: 1, fontWeight: 500 }}>{f.label}</span>
                              <span style={{
                                fontSize: 11, fontWeight: 600,
                                color: 'var(--primary-500)',
                                background: 'rgba(10,110,209,0.12)',
                                padding: '2px 7px', borderRadius: 10,
                                textTransform: 'capitalize',
                              }}>{f.fieldType}</span>
                            </button>
                          ))}
                        {preconfiguredRfqFields.filter((f) => !infoExtraFields.some((ef) => ef.fieldKey === f.fieldKey)).length === 0 && (
                          <div style={{ padding: '14px', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
                            All configured settings fields have been added.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Enterprise Evaluation (Tender only) ─────── */}
      {rfqMode === 'TENDER' && (
        <div className="create-rfq__card">
          <div className="create-rfq__card-header">
            <Settings size={18} />
            Enterprise Evaluation
            <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {evalCategories.length} categories
            </span>
          </div>
          <div className="create-rfq__card-body">
            <RfqEvaluationPanel
              categories={evalCategories}
              onChange={setEvalCategories}
            />
            {/* ── Action Buttons ── */}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                onClick={addCategoryToEval}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'transparent',
                  color: 'var(--primary-500)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Plus size={15} />
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RFQ: Info + Custom Fields ───────────── */}
      {rfqMode === 'RFQ' && (
        <div className="create-rfq__card">
          <div className="create-rfq__card-header">
            <FileText size={18} />
            RFQ
            <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {customFields.length} custom field{customFields.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="create-rfq__card-body">
            <div className="create-rfq__simple-hint" style={{ marginBottom: 20 }}>
              <FileText size={16} />
              <div>
                <strong>RFQ mode</strong> — Vendors will be evaluated based on standard criteria (price, delivery, compliance).
                You can add custom information fields that vendors must fill when submitting their quotation.
                {selectedVendors.length > 0 && (
                  <span style={{ display: 'block', marginTop: 4 }}>
                    Selected {selectedVendors.length} vendor{selectedVendors.length !== 1 ? 's' : ''} will receive a standard quotation request.
                  </span>
                )}
              </div>
            </div>

            {/* ── Scoring Weightages ── */}
            <div style={{ marginBottom: 20 }}>
              {simpleWeightageError && (
                <MessageStrip type="warning" compact style={{ marginBottom: 12 }} onClose={() => setSimpleWeightageError(null)}>
                  {simpleWeightageError}
                </MessageStrip>
              )}
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                Scoring Weightages
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(simpleWeightages).map(([key, param], idx) => {
                  const isEditing = editingKey === key;
                  const accentColor =
                    key === 'price' ? '#0a6ed1' :
                    key === 'vendorRating' ? '#107e3e' :
                    key === 'delivery' ? '#e9730c' :
                    key === 'compliance' ? '#8b5cf6' :
                    ['#0a6ed1', '#107e3e', '#e9730c', '#8b5cf6', '#0891b2', '#ec4899'][idx % 6];
                  const fillPct = Math.min(100, Math.max(0, param.weightage));
                  const trackBackground = `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${fillPct}%, var(--border-strong) ${fillPct}%, var(--border-strong) 100%)`;
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {isEditing ? (
                        <div style={{ flex: '1 1 180px', minWidth: 160, display: 'flex', gap: 4 }}>
                          <input
                            type="text"
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            autoFocus
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: '4px 6px',
                              border: '1px solid var(--primary-500)',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface)',
                              color: 'var(--text-primary)',
                              fontSize: 13,
                              fontWeight: 500,
                              fontFamily: 'inherit',
                              outline: 'none',
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditWeightage();
                              if (e.key === 'Escape') cancelEditWeightage();
                            }}
                          />
                          <button
                            onClick={saveEditWeightage}
                            title="Save"
                            style={{
                              width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                              border: 'none', background: 'var(--primary-500)', color: '#fff',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={cancelEditWeightage}
                            title="Cancel"
                            style={{
                              width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border)', background: 'transparent',
                              color: 'var(--text-secondary)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      ) : (
                        <span style={{
                          width: 120, minWidth: 120, fontSize: 14, fontWeight: 500,
                          color: 'var(--text-primary)', flexShrink: 0,
                        }}>
                          {param.label}
                        </span>
                      )}
                      <input
                        type="range"
                        className="create-rfq__range-slider"
                        min="0"
                        max="100"
                        value={param.weightage}
                        onChange={(e) => updateSimpleWeightage(key, parseInt(e.target.value, 10))}
                        style={{
                          flex: 1,
                          accentColor,
                          color: accentColor,
                          background: trackBackground,
                          height: 4,
                          cursor: 'pointer',
                        }}
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={param.weightage}
                        onChange={(e) => updateSimpleWeightage(key, parseInt(e.target.value, 10) || 0)}
                        style={{
                          width: 52,
                          padding: '6px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface)',
                          color: 'var(--text-primary)',
                          fontSize: 14,
                          fontWeight: 700,
                          fontFamily: 'inherit',
                          textAlign: 'center',
                          outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', width: 20 }}>%</span>
                      {/* Edit button */}
                      <button
                        onClick={() => startEditWeightage(key, param.label)}
                        title="Edit label"
                        style={{
                          width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                          border: 'none', background: 'transparent',
                          color: 'var(--text-placeholder)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                      >
                        <Edit3 size={13} />
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={() => deleteWeightage(key)}
                        title="Remove parameter"
                        style={{
                          width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                          border: 'none', background: 'transparent',
                          color: 'var(--text-placeholder)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#dc2626'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-placeholder)'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}

                {Object.keys(simpleWeightages).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)', fontSize: 14 }}>
                    All weightage parameters have been removed. Reset to restore defaults.
                  </div>
                )}

                {/* Total bar + action buttons always visible */}
                <div className="create-rfq__weightage-bar">
                  <div className="create-rfq__weightage-actions">
                    <button
                      className="create-rfq__btn--weightage-reset"
                      onClick={resetSimpleWeightages}
                      title="Reset to system defaults"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                      </svg>
                      Reset to Defaults
                    </button>
                    <button
                      className={`create-rfq__btn--weightage-save${weightagesSaved ? ' saved' : ''}`}
                      onClick={handleSaveWeightages}
                      disabled={savingWeightages}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                      </svg>
                      {savingWeightages ? 'Saving...' : weightagesSaved ? 'Saved!' : 'Save Weightages'}
                    </button>
                  </div>
                  <div className="create-rfq__weightage-total">
                    <span>Total: {simpleWeightageTotal}%</span>
                    <span className={`create-rfq__weightage-total-status ${simpleWeightageTotal === 100 ? 'create-rfq__weightage-total-status--ok' : 'create-rfq__weightage-total-status--err'}`}>
                      {simpleWeightageTotal === 100 ? '✓ Total is 100%' : 'must total exactly 100%'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Custom Fields Section ── */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                Additional Scoring Weightages
              </p>

              {customFields.length === 0 && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  No custom fields added yet. Add fields to request specific information from vendors (e.g. warranty period, delivery terms).
                </p>
              )}

              {customFields.map((cf) => (
                <div
                  key={cf.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    marginBottom: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-elevated)',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Field name (e.g. Warranty Period)"
                    value={cf.fieldName}
                    onChange={(e) => updateCustomField(cf.id, { fieldName: e.target.value })}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />

                  {/* Weightage Input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={cf.weightage}
                      onChange={(e) => updateCustomField(cf.id, { weightage: parseInt(e.target.value) || 0 })}
                      style={{
                        width: 44,
                        padding: '5px 6px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface)',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        textAlign: 'center',
                        outline: 'none',
                      }}
                      title="Scoring weightage (%)"
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginRight: 2 }}>%</span>
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cf.required}
                      onChange={(e) => updateCustomField(cf.id, { required: e.target.checked })}
                      style={{ accentColor: 'var(--primary-500)' }}
                    />
                    Required
                  </label>
                  <button
                    onClick={() => removeCustomField(cf.id)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-placeholder)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    title="Remove field"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <button
                  onClick={addCustomField}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 0',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--primary-500)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <Plus size={14} />
                  Add Custom Field
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* ── Line Items ───────────────────────────────────── */}
        <div className="create-rfq__card">
          <div className="create-rfq__card-header">
            <Package size={18} />
            Line Items
            <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="create-rfq__card-body">
            <div style={{ overflowX: 'auto' }}>
              <table className="create-rfq__items-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>#</th>
                    <th style={{ width: 120 }}>Item Code</th>
                    <th style={{ width: 200 }}>Item Name *</th>
                    <th style={{ width: 180 }}>Description</th>
                    <th style={{ width: 130 }}>Qty *</th>
                    <th style={{ width: 140 }}>Unit</th>
                    <th style={{ width: 150 }}>Expected Date</th>
                    <th style={{ width: 44 }} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id}>
                      <td>
                        <span className="create-rfq__row-num">{idx + 1}</span>
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="e.g. ITM-001"
                          value={item.itemCode || ''}
                          onChange={(e) => updateItem(item.id, 'itemCode', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="Item name"
                          value={item.itemName}
                          onChange={(e) => updateItem(item.id, 'itemName', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="Brief description"
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          placeholder="0"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                        >
                          <option value="">— Select unit —</option>
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="date"
                          value={item.expectedDate}
                          onChange={(e) => updateItem(item.id, 'expectedDate', e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          className="create-rfq__remove-row"
                          onClick={() => removeItem(item.id)}
                          title="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="create-rfq__add-row" onClick={addItem}>
              <Plus size={15} />
              Add Line Item
            </button>
          </div>
        </div>

      {/* ── Bid Security ────────────────────────────────── */}
        <div className="create-rfq__card">
          <div
            className="create-rfq__card-header"
            onClick={() => setBidSecurityExpanded((v) => !v)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <Shield size={18} />
            Bid Security & Bond
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ChevronDown
                size={16}
                style={{
                  color: 'var(--text-secondary)',
                  transition: 'transform 0.2s',
                  transform: bidSecurityExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </div>
          </div>

          {bidSecurityExpanded && (
            <div className="create-rfq__card-body">
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Select what is required. Vendors will provide the actual details when submitting their quotation.
              </p>
              <div className="create-rfq__form-grid" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 600 }}>
                {/* Bid Security Required */}
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px',
                    border: `2px solid ${bidSecurityEnabled ? 'var(--primary-500)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: bidSecurityEnabled ? 'rgba(10,110,209,0.04)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={bidSecurityEnabled}
                    onChange={(e) => setBidSecurityEnabled(e.target.checked)}
                    style={{ accentColor: 'var(--primary-500)', width: 18, height: 18 }}
                  />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Bid Security Required?</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Amount, type, validity & document</div>
                  </div>
                </label>

                {/* Bid Bond Required */}
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px',
                    border: `2px solid ${bidBondEnabled ? 'var(--primary-500)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: bidBondEnabled ? 'rgba(10,110,209,0.04)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={bidBondEnabled}
                    onChange={(e) => setBidBondEnabled(e.target.checked)}
                    style={{ accentColor: 'var(--primary-500)', width: 18, height: 18 }}
                  />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Bid Bond Required?</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Bond number, issuer, amount & document</div>
                  </div>
                </label>
              </div>

              {!bidSecurityEnabled && !bidBondEnabled && (
                <p style={{ fontSize: 14, color: 'var(--text-placeholder)', margin: '12px 0 0' }}>
                  No security requirements selected. Vendors will submit quotations without bid security or bond.
                </p>
              )}
              {/* ── Min Value & Validity Inputs ── */}
              {bidSecurityEnabled && (
                <div style={{
                  marginTop: 16,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 18,
                }}>
                  <div className="create-rfq__field">
                    <label className="create-rfq__label">Min Bid Security Value</label>
                    <span className="create-rfq__hint" style={{ marginTop: -4 }}>Minimum amount vendor must provide</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        className="create-rfq__input"
                        type="number"
                        min="0"
                        placeholder="e.g. 100000"
                        value={bidSecurityMinValue}
                        onChange={(e) => setBidSecurityMinValue(e.target.value)}
                        style={{ paddingRight: 160 }}
                      />
                      <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                        <CurrencySelector
                          value={bidSecurityMinCurrency}
                          onChange={setBidSecurityMinCurrency}
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="create-rfq__field">
                    <label className="create-rfq__label">Min Bid Security Validity</label>
                    <span className="create-rfq__hint" style={{ marginTop: -4 }}>Minimum validity period required</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        className="create-rfq__input"
                        type="number"
                        min="1"
                        placeholder="e.g. 90"
                        value={bidSecurityMinValidity}
                        onChange={(e) => setBidSecurityMinValidity(e.target.value)}
                        style={{ paddingRight: 56 }}
                      />
                      <span style={{ position: 'absolute', right: 14, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', pointerEvents: 'none' }}>
                        Days
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {bidBondEnabled && (
                <div style={{
                  marginTop: 16,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 18,
                }}>
                  <div className="create-rfq__field">
                    <label className="create-rfq__label">Min Bid Bond Value</label>
                    <span className="create-rfq__hint" style={{ marginTop: -4 }}>Minimum bond amount vendor must provide</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        className="create-rfq__input"
                        type="number"
                        min="0"
                        placeholder="e.g. 500000"
                        value={bidBondMinValue}
                        onChange={(e) => setBidBondMinValue(e.target.value)}
                        style={{ paddingRight: 160 }}
                      />
                      <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                        <CurrencySelector
                          value={bidBondMinCurrency}
                          onChange={setBidBondMinCurrency}
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="create-rfq__field">
                    <label className="create-rfq__label">Min Bid Bond Validity</label>
                    <span className="create-rfq__hint" style={{ marginTop: -4 }}>Minimum validity period required</span>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        className="create-rfq__input"
                        type="number"
                        min="1"
                        placeholder="e.g. 120"
                        value={bidBondMinValidity}
                        onChange={(e) => setBidBondMinValidity(e.target.value)}
                        style={{ paddingRight: 56 }}
                      />
                      <span style={{ position: 'absolute', right: 14, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', pointerEvents: 'none' }}>
                        Days
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {(bidSecurityEnabled || bidBondEnabled) && (
                <div style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                }}>
                  <strong style={{ color: 'var(--text-primary)' }}>✓ Requirements set:</strong>{' '}
                  {bidSecurityEnabled && 'Bid Security'}
                  {bidSecurityMinValue && ` (Min: ${bidSecurityMinValue})`}
                  {bidSecurityMinValidity && `, Validity: ${bidSecurityMinValidity}d`}
                  {bidSecurityEnabled && bidBondEnabled && ' & '}
                  {bidBondEnabled && 'Bid Bond'}
                  {bidBondMinValue && ` (Min: ${bidBondMinValue})`}
                  {bidBondMinValidity && `, Validity: ${bidBondMinValidity}d`}
                  {' — vendors will provide details when submitting their quotation.'}
                </div>
              )}
            </div>
          )}
        </div>

      {/* ── Select Vendors ──────────────────────────────── */}
        <div className="create-rfq__card">
          <div className="create-rfq__card-header">
            <Users size={18} />
            Select Vendors
            <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {selectedVendors.length} selected
            </span>
          </div>
          <div className="create-rfq__card-body">
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Select the vendors you want to invite for this RFQ. They will receive a notification to submit their quotation.
            </p>
            {vendorsLoading && <CardSkeleton count={2} />}
            {!vendorsLoading && !department && (
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                Select a department in RFQ Details to see matching vendors.
              </p>
            )}
            {!vendorsLoading && department && availableVendors.length === 0 && (
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                No vendors in the system. Add vendors first, then create an RFQ.
              </p>
            )}
            {!vendorsLoading && department && availableVendors.length > 0 && departmentVendors.length === 0 && (
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                No vendors found for {department}. Update vendor categories on the Vendors page or choose another department.
              </p>
            )}
            <div className="create-rfq__vendors-grid">
              {departmentVendors.map((v) => {
                const selected = selectedVendors.includes(v.id);
                return (
                  <div
                    key={v.id}
                    className={`create-rfq__vendor-card ${selected ? 'create-rfq__vendor-card--selected' : ''}`}
                    onClick={() => toggleVendor(v.id)}
                  >
                    <span className="create-rfq__vendor-check">
                      {selected && <Check size={13} />}
                    </span>
                    <span className={`create-rfq__vendor-avatar create-rfq__vendor-avatar--${v.avatarMod}`}>
                      {v.initials}
                    </span>
                    <div className="create-rfq__vendor-info">
                      <div className="create-rfq__vendor-name">{v.name}</div>
                      <div className="create-rfq__vendor-email">{v.email}</div>
                      <div className="create-rfq__vendor-category">{v.category}</div>
                    </div>
                    <span className="create-rfq__vendor-score" style={{
                      color: v.overallScore != null && v.overallScore >= 80 ? '#16a34a' : v.overallScore != null && v.overallScore >= 60 ? '#ca8a04' : '#dc2626',
                      fontWeight: 700,
                    }}>
                      {v.overallScore != null ? `${v.overallScore}%` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      {successMsg && (
        <MessageStrip type="success" compact className="sap-message-strip--flush" style={{ margin: '0 0 12px' }} onClose={() => { setSuccessMsg(null); navigate('/rfq'); }}>
          {successMsg}
        </MessageStrip>
      )}
      {submitError && (
        <MessageStrip type="error" compact className="sap-message-strip--flush" style={{ margin: '0 0 12px' }} onClose={() => setSubmitError(null)}>
          {submitError}
        </MessageStrip>
      )}

      {/* ── Footer Actions ─────────────────────────────────── */}
      <div className="create-rfq__footer">
        <div className="create-rfq__footer-left">
          <button className="create-rfq__btn create-rfq__btn--ghost" onClick={() => navigate('/rfq')}>
            Cancel
          </button>
        </div>
        <div className="create-rfq__footer-right">
          <button
            className="create-rfq__btn create-rfq__btn--secondary"
            onClick={handleSaveDraft}
            disabled={savingDraft || sendingEmail || isEditLocked || !canCreateRFQ}
            style={!canCreateRFQ ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
            title={!canCreateRFQ ? "Admin has not allowed this action. You do not have permission to save draft RFQs." : undefined}
          >
            <Save size={16} />
            {savingDraft ? 'Saving\u2026' : 'Save as Draft'}
          </button>
          <button
            className="create-rfq__btn create-rfq__btn--primary"
            onClick={handleSubmit}
            disabled={savingDraft || sendingEmail || isEditLocked || !canCreateRFQ}
            style={!canCreateRFQ ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
            title={!canCreateRFQ ? "Admin has not allowed this action. You do not have permission to submit RFQs." : undefined}
          >
            <Send size={16} />
            {sendingEmail ? 'Sending\u2026' : 'Submit & Email Vendors'}
          </button>
        </div>
      </div>

      <CreatorLevelPromptModal
        isOpen={showLevelPrompt}
        title="Approval & Workflow Settings"
        initialRfqApprovalStartPoint={rfqApprovalStartPoint}
        initialQuotationApprovalMode={quotationApprovalMode}
        onConfirm={(startLevelNumber, startPoint, mode) => {
          if (startPoint) setRfqApprovalStartPoint(startPoint);
          if (mode) setQuotationApprovalMode(mode);
          setShowLevelPrompt(false);
          const act = pendingAction;
          setPendingAction(null);
          if (act === 'draft') {
            void executeSaveDraft(startLevelNumber, startPoint, mode);
          } else {
            void executeSubmit(startLevelNumber, startPoint, mode);
          }
        }}
        onCancel={() => {
          setShowLevelPrompt(false);
          setPendingAction(null);
        }}
      />

      {approvalSubmittedRfq && (
        <div className="prompt-modal-backdrop" onClick={() => { setApprovalSubmittedRfq(null); navigate('/rfq'); }}>
          <div className="prompt-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, textAlign: 'center', padding: '32px 28px' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', border: '1px solid rgba(16, 185, 129, 0.25)'
            }}>
              {approvalSubmittedRfq.isApprovalChain ? <CheckCircle2 size={32} /> : <Send size={30} />}
            </div>
            <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-primary)' }}>
              {approvalSubmittedRfq.isApprovalChain ? 'RFQ Sent for Internal Approval!' : 'RFQ Sent to Vendors!'}
            </h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
              {approvalSubmittedRfq.isApprovalChain ? (
                <>
                  RFQ <strong style={{ color: 'var(--text-primary)' }}>#{approvalSubmittedRfq.number}</strong> has been successfully created and sent to <strong>Approver Level {approvalSubmittedRfq.levelNumber || 1} (Approver 1)</strong> for internal approval.
                  <br/><br/>
                  Once internally approved, it will be automatically dispatched to vendors.
                </>
              ) : (
                <>
                  RFQ <strong style={{ color: 'var(--text-primary)' }}>#{approvalSubmittedRfq.number}</strong> has been successfully created and sent to vendors to submit their quotations.
                  <br/><br/>
                  Invited vendors can now access this RFQ and submit their proposals directly through the portal.
                </>
              )}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {approvalSubmittedRfq.isApprovalChain ? (
                <>
                  <button
                    className="create-rfq__btn create-rfq__btn--secondary"
                    style={{ minWidth: 130, justifyContent: 'center' }}
                    onClick={() => { setApprovalSubmittedRfq(null); navigate('/approvals'); }}
                  >
                    View Approvals
                  </button>
                  <button
                    className="create-rfq__btn create-rfq__btn--primary"
                    style={{ minWidth: 130, justifyContent: 'center' }}
                    onClick={() => { setApprovalSubmittedRfq(null); navigate('/rfq'); }}
                  >
                    Go to RFQ List
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="create-rfq__btn create-rfq__btn--secondary"
                    style={{ minWidth: 130, justifyContent: 'center' }}
                    onClick={() => { setApprovalSubmittedRfq(null); window.location.reload(); }}
                  >
                    Create Another RFQ
                  </button>
                  <button
                    className="create-rfq__btn create-rfq__btn--primary"
                    style={{ minWidth: 130, justifyContent: 'center' }}
                    onClick={() => { setApprovalSubmittedRfq(null); navigate('/rfq'); }}
                  >
                    Go to RFQ List
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
