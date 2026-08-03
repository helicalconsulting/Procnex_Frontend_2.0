import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { procurementService, type VendorInvitationRow, type VendorSearchResult } from '../../services/procurementService';
import { companySettingsService, type RequiredDocument, type DocumentTemplate, type Category } from '../../services/companySettingsService';
import PhoneInput from '../../components/shared/PhoneInput';
import VendorSuggestDropdown from '../../components/shared/VendorSuggestDropdown';
import VendorDetailModal from '../../components/shared/VendorDetailModal';
import VendorDuplicateModal from '../../components/shared/VendorDuplicateModal';
import { sseClient } from '../../services/sseClient';
import {
  Send,
  Building2,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  Copy,
  Trash2,
  Info,
  Users,
  Plus,
  X,
  Package,
  Hash,
  Maximize2,
  Minimize2,
  ExternalLink,
  List,
  FileText,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertTriangle,
  Tag,
  ChevronDown,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import DesktopWindow from '../../components/shared/DesktopWindow';
import './NewOnboardingPage.css';

// Heliflow — New Onboarding Page (Exact Phone Match)
type InviteStatus = VendorInvitationRow['status'];

const statusConfig: Record<InviteStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:   { label: 'Waiting for user response', cls: 'pending',  icon: <Clock size={12} /> },
  in_queue:  { label: 'In Approval Queue', cls: 'accepted', icon: <CheckCircle2 size={12} /> },
  approved:  { label: 'Approved',          cls: 'accepted', icon: <CheckCircle2 size={12} /> },
  expired:   { label: 'Expired',           cls: 'expired',  icon: <XCircle size={12} /> },
  declined:  { label: 'Declined',          cls: 'declined', icon: <XCircle size={12} /> },
};

export default function NewOnboardingPage() {
  const navigate = useNavigate();
  const { data: invitations, loading, error, reload } = useServiceData(
    () => procurementService.listInvitations(),
    [] as VendorInvitationRow[],
    [],
    { cacheTtlMs: 0 }
  );

  // SSE listener — auto-refresh when vendor accepts invitation
  // SSE connection is managed centrally by AppLayout
  useEffect(() => {
    const unsubscribe = sseClient.on('notification', (data: unknown) => {
      const event = data as { type?: string } | undefined;
      // Reload on any vendor-related notification (accept, document upload, etc.)
      if (!event?.type || event.type === 'vendor_accepted') {
        reload();
      }
    });
    return () => unsubscribe();
  }, [reload]);

  // ── Periodic auto-refresh ────────────────────────────────────────────
  // Refreshes every 30 seconds so that expired/deleted invitations are
  // picked up without manual reload. The backend deletes expired vendors
  // on-the-spot during listing, so this keeps the UI in sync.
  useEffect(() => {
    const interval = setInterval(() => {
      reload();
    }, 30_000);
    return () => clearInterval(interval);
  }, [reload]);

  const [companyName, setCompanyName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactCountryCode, setContactCountryCode] = useState('+254');
  const [contactPhone, setContactPhone] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Load vendor categories from Company Settings
  useEffect(() => {
    (async () => {
      try {
        const cats = await companySettingsService.listCategories();
        setCategories(cats.filter((c) => c.isActive !== false));
      } catch {
        // ignore
      }
    })();
  }, []);

  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Array<{ itemCode: string; itemName: string }>>([]);
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isInviteExpanded, setIsInviteExpanded] = useState(false);
  const [isSentExpanded, setIsSentExpanded] = useState(false);
  const [showItemsPopup, setShowItemsPopup] = useState(false);
  const [itemsMinimized, setItemsMinimized] = useState(false);
  const itemsBarBtnRef = useRef<HTMLButtonElement>(null);

  // ── Optimistic delete tracking ──
  const [deletingIds, setDeletingIds] = useState<Set<string | number>>(new Set());

  // ── Document Selection ──
  const [availableDocs, setAvailableDocs] = useState<RequiredDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [showDocsPopup, setShowDocsPopup] = useState(false);
  const [docsMinimized, setDocsMinimized] = useState(false);
  const docsBarBtnRef = useRef<HTMLButtonElement>(null);
  const [docsLoading, setDocsLoading] = useState(false);

  // ── Separate NDA, MNDA & Any Other Legal Docs Required ──
  const [ndaRequired, setNdaRequired] = useState(false);
  const [mndaRequired, setMndaRequired] = useState(false);
  const [anyOtherRequired, setAnyOtherRequired] = useState(false);
  const [ndaTemplateId, setNdaTemplateId] = useState<string | null>(null);
  const [mndaTemplateId, setMndaTemplateId] = useState<string | null>(null);
  const [anyOtherTemplateId, setAnyOtherTemplateId] = useState<string | null>(null);
  const [showNdaTemplateModal, setShowNdaTemplateModal] = useState(false);
  const [showMndaTemplateModal, setShowMndaTemplateModal] = useState(false);
  const [showAnyOtherTemplateModal, setShowAnyOtherTemplateModal] = useState(false);
  const [legalDocsOpen, setLegalDocsOpen] = useState(false);
  const [ndaTemplates, setNdaTemplates] = useState<DocumentTemplate[]>([]);
  const [mndaTemplates, setMndaTemplates] = useState<DocumentTemplate[]>([]);
  const [anyOtherTemplates, setAnyOtherTemplates] = useState<DocumentTemplate[]>([]);
  const [ndaTemplatesLoading, setNdaTemplatesLoading] = useState(false);

  // ── Template Preview ──
  const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplate | null>(null);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

  // ── Required Document Preview ──
  const [previewDoc, setPreviewDoc] = useState<RequiredDocument | null>(null);

  // ── Vendor Search / Duplicate Detection ──
  const [searchResults, setSearchResults] = useState<VendorSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedSearchVendor, setSelectedSearchVendor] = useState<VendorSearchResult | null>(null);
  const [showVendorDetail, setShowVendorDetail] = useState(false);
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);
  const companyNameRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasShownDuplicateRef = useRef(false);
  const continuedAsNewRef = useRef(false);

  // Debounced vendor search
  useEffect(() => {
    const q = companyName.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      setHasSearched(false);
      return;
    }

    if (continuedAsNewRef.current) {
      setShowSuggestions(false);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await procurementService.searchVendors(q);
        if (!continuedAsNewRef.current) {
          setSearchResults(results);
          setShowSuggestions(true); // Always show dropdown (results or empty state)
          setHasSearched(true);
        }
      } catch {
        if (!continuedAsNewRef.current) {
          setSearchResults([]);
          setShowSuggestions(true);
          setHasSearched(true);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [companyName]);

  // ── Invitation Detail Popup ──
  const [detailInvitation, setDetailInvitation] = useState<VendorInvitationRow | null>(null);

  // ── Dedicated Eye View Popup Modal ──
  const [eyeViewModal, setEyeViewModal] = useState<{
    type: 'items' | 'documents';
    companyName: string;
    items?: Array<{ itemCode: string; itemName: string }>;
    docNames?: string[];
  } | null>(null);

  // ── Pre-Send Predictive Match Confidence Modal ──
  const [showPreSendConfidenceModal, setShowPreSendConfidenceModal] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    score: number;
    duplicationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    matchedVendor: { name: string; email: string; score: number } | null;
    breakdown?: {
      nameScore: number;
      emailScore: number;
      personScore: number;
      phoneScore: number;
    };
  } | null>(null);

  // ── SAP Style Invitation Sent Success Modal ──
  const [sentSuccessModal, setSentSuccessModal] = useState<{
    companyName: string;
    contactEmail: string;
    inviteCode: string;
    expiresAt: string;
    itemsCount: number;
    documentsCount: number;
  } | null>(null);

  // Load available documents from Company Settings
  useEffect(() => {
    (async () => {
      setDocsLoading(true);
      try {
        const docs = await companySettingsService.listRequiredDocuments();
        setAvailableDocs(docs);
      } catch {
        // ignore
      } finally {
        setDocsLoading(false);
      }
    })();
  }, []);

  // Load NDA/MNDA document templates from Company Settings
  useEffect(() => {
    (async () => {
      setNdaTemplatesLoading(true);
      try {
        const templates = await companySettingsService.listDocumentTemplates();
        setNdaTemplates(templates.filter(t => t.type === 'NDA'));
        setMndaTemplates(templates.filter(t => t.type === 'MNDA'));
      } catch {
        // ignore
      } finally {
        setNdaTemplatesLoading(false);
      }
    })();
  }, []);

  // Handle template preview
  const handlePreviewTemplate = useCallback((template: DocumentTemplate) => {
    setPreviewTemplate(template);
    setShowTemplatePreview(true);
  }, []);

  // Handle NDA/MNDA template selection
  const handleOpenNdaTemplateModal = useCallback(() => {
    setNdaTemplatesLoading(true);
    companySettingsService.listDocumentTemplates().then(templates => {
      setNdaTemplates(templates.filter(t => t.type === 'NDA'));
      setMndaTemplates(templates.filter(t => t.type === 'MNDA'));
      setAnyOtherTemplates(templates.filter(t => t.type === 'ANY_OTHER'));
    }).catch(() => {}).finally(() => { setNdaTemplatesLoading(false); });
    setShowNdaTemplateModal(true);
  }, []);

  const handleOpenMndaTemplateModal = useCallback(() => {
    setNdaTemplatesLoading(true);
    companySettingsService.listDocumentTemplates().then(templates => {
      setNdaTemplates(templates.filter(t => t.type === 'NDA'));
      setMndaTemplates(templates.filter(t => t.type === 'MNDA'));
      setAnyOtherTemplates(templates.filter(t => t.type === 'ANY_OTHER'));
    }).catch(() => {}).finally(() => { setNdaTemplatesLoading(false); });
    setShowMndaTemplateModal(true);
  }, []);

  const handleOpenAnyOtherTemplateModal = useCallback(() => {
    setNdaTemplatesLoading(true);
    companySettingsService.listDocumentTemplates().then(templates => {
      setNdaTemplates(templates.filter(t => t.type === 'NDA'));
      setMndaTemplates(templates.filter(t => t.type === 'MNDA'));
      setAnyOtherTemplates(templates.filter(t => t.type === 'ANY_OTHER'));
    }).catch(() => {}).finally(() => { setNdaTemplatesLoading(false); });
    setShowAnyOtherTemplateModal(true);
  }, []);

  const handleSelectNdaTemplate = useCallback((templateId: string) => {
    setNdaTemplateId(templateId);
  }, []);

  const handleSelectMndaTemplate = useCallback((templateId: string) => {
    setMndaTemplateId(templateId);
  }, []);

  const handleSelectAnyOtherTemplate = useCallback((templateId: string) => {
    setAnyOtherTemplateId(templateId);
  }, []);

  const handleOpenDocsPopup = useCallback(async () => {
    // Refresh documents list from Company Settings so newly added docs appear
    setDocsLoading(true);
    try {
      const docs = await companySettingsService.listRequiredDocuments();
      setAvailableDocs(docs);
    } catch {
      // ignore
    } finally {
      setDocsLoading(false);
    }
    setShowDocsPopup(true);
  }, []);

  const mandatoryDocs = availableDocs.filter(d => (d.documentCategory || 'mandatory') === 'mandatory');
  const optionalDocs = availableDocs.filter(d => d.documentCategory === 'optional');
  const anyOtherDocs = availableDocs.filter(d => d.documentCategory === 'any_other');

  const toggleDocSelection = useCallback((docId: string) => {
    setSelectedDocIds(prev =>
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  }, []);

  const selectedDocNames = useMemo(() => {
    return availableDocs
      .filter(d => selectedDocIds.includes(d.id))
      .map(d => d.name);
  }, [availableDocs, selectedDocIds]);

  // Resolve document names from IDs for the detail modal
  const detailDocNames = useMemo(() => {
    if (!detailInvitation?.documentIds || detailInvitation.documentIds.length === 0) return [];
    return detailInvitation.documentIds.map(id => {
      const doc = availableDocs.find(d => d.id === id);
      return doc?.name || id;
    });
  }, [detailInvitation, availableDocs]);

  const pendingCount = useMemo(() => invitations.filter((i) => i.status === 'pending').length, [invitations]);
  const inQueueCount = useMemo(() => invitations.filter((i) => i.status === 'in_queue').length, [invitations]);

  const isPhoneInvalid = useMemo(() => {
    if (!contactPhone.trim()) return false;
    const digits = contactPhone.replace(/\D/g, '');
    return digits.length < 7 || digits.length > 15;
  }, [contactPhone]);

  useBodyScrollLock(isInviteExpanded);
  useBodyScrollLock(isSentExpanded);
  useBodyScrollLock(!!showVendorDetail);
  useBodyScrollLock(!!showDuplicateAlert);
  useBodyScrollLock(showTemplatePreview);
  useBodyScrollLock(!!sentSuccessModal);
  useBodyScrollLock(!!eyeViewModal);
  useBodyScrollLock(showPreSendConfidenceModal);
  useBodyScrollLock(!!previewDoc);

  // Escape key closes expanded modals, template preview, success modal, eye view modal, pre-send modal and doc preview
  useEffect(() => {
    if (!isInviteExpanded && !isSentExpanded && !showTemplatePreview && !sentSuccessModal && !eyeViewModal && !showPreSendConfidenceModal && !previewDoc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsInviteExpanded(false);
        setIsSentExpanded(false);
        setShowTemplatePreview(false);
        setSentSuccessModal(null);
        setEyeViewModal(null);
        setShowPreSendConfidenceModal(false);
        setPreviewDoc(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isInviteExpanded, isSentExpanded, showTemplatePreview, sentSuccessModal, eyeViewModal, showPreSendConfidenceModal, previewDoc]);



  // Navigate to onboarding queue (clicking a vendor)
  const goToQueue = useCallback(() => {
    navigate('/onboarding/queue');
  }, [navigate]);

  const addItem = useCallback(() => {
    setItems(prev => [...prev, { itemCode: '', itemName: '' }]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback((index: number, field: 'itemCode' | 'itemName', value: string) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }, []);

  // ── Vendor Search Handlers ──

  const handleSelectSearchResult = useCallback((vendor: VendorSearchResult) => {
    setSelectedSearchVendor(vendor);
    setShowSuggestions(false);
    setShowVendorDetail(true);
    hasShownDuplicateRef.current = false;
  }, []);

  const handleCloseSuggestions = useCallback(() => {
    setShowSuggestions(false);
  }, []);

  const handleCloseVendorDetail = useCallback(() => {
    setShowVendorDetail(false);
    setSelectedSearchVendor(null);
  }, []);

  const handleContinueNewFromDetail = useCallback(() => {
    setShowVendorDetail(false);
    setSelectedSearchVendor(null);
    setShowDuplicateAlert(false);
    hasShownDuplicateRef.current = true;
    continuedAsNewRef.current = true;
    setShowSuggestions(false);
    setSearchResults([]);
  }, []);

  const handleViewExistingVendor = useCallback(() => {
    // Navigate to vendors page with the vendor's name for easy finding
    navigate('/vendors');
    setShowVendorDetail(false);
    setShowDuplicateAlert(false);
    setSelectedSearchVendor(null);
  }, [navigate]);

  const handleDuplicateCancel = useCallback(() => {
    setShowDuplicateAlert(false);
    hasShownDuplicateRef.current = true; // Don't re-prompt for this session
  }, []);

  const handleDuplicateCreateAnyway = useCallback(() => {
    setShowDuplicateAlert(false);
    setSelectedSearchVendor(null);
    setShowVendorDetail(false);
    hasShownDuplicateRef.current = true; // Prevent showing again
    continuedAsNewRef.current = true;
    setShowSuggestions(false);
    setSearchResults([]);
  }, []);

  // When company name changes, keep predictive analysis disabled if user already clicked Continue with New Vendor
  const handleCompanyNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setCompanyName(newVal);
    hasShownDuplicateRef.current = false;
  }, []);

  // Handle blur on company name field — if there's an exact/high match, show duplicate alert
  const handleCompanyNameBlur = useCallback(() => {
    // Delay to let the suggestion click handler fire first
    setTimeout(() => {
      const hasHighMatch = searchResults.some((v) => v.score >= 80);
      if (
        companyName.trim().length >= 2 &&
        hasHighMatch &&
        !hasShownDuplicateRef.current &&
        !continuedAsNewRef.current &&
        !showVendorDetail
      ) {
        const bestMatch = searchResults.find((v) => v.score >= 80);
        if (bestMatch) {
          setSelectedSearchVendor(bestMatch);
          setShowDuplicateAlert(true);
          hasShownDuplicateRef.current = true;
        }
      }
    }, 200);
  }, [companyName, searchResults, showVendorDetail]);

  const handleSendInviteClick = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactEmail.trim()) {
      setFormError('Please fill in both Company Name and Contact Email');
      return;
    }
    if (contactPhone.trim()) {
      const digits = contactPhone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        setFormError('Please enter a valid phone number (7 to 15 digits)');
        return;
      }
    }
    setFormError(null);
    setShowPreSendConfidenceModal(true);
    setAuditLoading(true);

    try {
      // Search DB by company name, email, and phone
      const [byName, byEmail, byPhone] = await Promise.all([
        procurementService.searchVendors(companyName.trim()).catch(() => []),
        contactEmail.trim() ? procurementService.searchVendors(contactEmail.trim()).catch(() => []) : Promise.resolve([]),
        contactPhone.trim() ? procurementService.searchVendors(contactPhone.trim()).catch(() => []) : Promise.resolve([]),
      ]);

      const dbResults = [...byName, ...byEmail, ...byPhone];

      // Combine DB results with local invitations to find candidate matches
      const candidates: Array<{ companyName: string; contactEmail: string; contactPerson?: string; contactPhone?: string }> = [
        ...invitations.map(i => ({ companyName: i.companyName, contactEmail: i.contactEmail, contactPerson: i.contactPerson || undefined, contactPhone: i.contactPhone || undefined })),
        ...dbResults.map(v => ({ companyName: v.name, contactEmail: v.email, contactPerson: v.contactPerson || undefined, contactPhone: v.phone || v.contactPhone || undefined })),
      ];

      const currentInput = {
        companyName: companyName.trim(),
        contactEmail: contactEmail.trim(),
        contactPerson: contactPerson.trim(),
        contactPhone: contactPhone.trim() ? `${contactCountryCode}${contactPhone.trim()}` : '',
      };

      const norm = (str?: string) => (str || '').trim().toLowerCase();
      
      const cleanPhoneDigits = (raw?: string) => {
        if (!raw) return '';
        let d = raw.replace(/\D/g, '').replace(/^0+/, '');
        if (d.length > 10) {
          return d.slice(-10);
        }
        return d;
      };

      let bestScore = 0;
      let bestMatchedVendor: { name: string; email: string; score: number } | null = null;
      let bestBreakdown = { nameScore: 0, emailScore: 0, personScore: 0, phoneScore: 0 };

      candidates.forEach((cand) => {
        // 1. Company Name Match (25% weight)
        const inName = norm(currentInput.companyName);
        const exName = norm(cand.companyName);
        let nameScore = 0;
        if (inName && exName) {
          if (inName === exName) nameScore = 100;
          else if (inName.includes(exName) || exName.includes(inName)) nameScore = 80;
        }

        // 2. Email Match (25% weight)
        const inEmail = norm(currentInput.contactEmail);
        const exEmail = norm(cand.contactEmail);
        let emailScore = 0;
        if (inEmail && exEmail) {
          if (inEmail === exEmail) emailScore = 100;
          else if (inEmail.split('@')[1] && inEmail.split('@')[1] === exEmail.split('@')[1] && !['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(inEmail.split('@')[1])) {
            emailScore = 60;
          }
        }

        // 3. Contact Person Match (25% weight)
        const inPerson = norm(currentInput.contactPerson);
        const exPerson = norm(cand.contactPerson);
        let personScore = 0;
        if (inPerson && exPerson) {
          if (inPerson === exPerson) personScore = 100;
          else if (inPerson.includes(exPerson) || exPerson.includes(inPerson)) personScore = 75;
          else {
            const inWords = inPerson.split(/\s+/);
            const exWords = exPerson.split(/\s+/);
            if (inWords.some(w => exWords.includes(w) && w.length >= 3)) personScore = 50;
          }
        }

        // 4. Phone Match (25% weight) - Strict Binary Match (100% if same, 0% if different/missing)
        const inPhoneDigits = cleanPhoneDigits(currentInput.contactPhone);
        const exPhoneDigits = cleanPhoneDigits(cand.contactPhone);
        let phoneScore = 0;
        if (inPhoneDigits && exPhoneDigits && inPhoneDigits === exPhoneDigits) {
          phoneScore = 100;
        } else {
          phoneScore = 0;
        }

        // Equal 25% weightage calculation
        const total = Math.round(nameScore * 0.25 + emailScore * 0.25 + personScore * 0.25 + phoneScore * 0.25);

        if (total > bestScore) {
          bestScore = total;
          bestMatchedVendor = { name: cand.companyName, email: cand.contactEmail, score: total };
          bestBreakdown = { nameScore, emailScore, personScore, phoneScore };
        }
      });

      let risk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (bestScore >= 60) risk = 'HIGH';
      else if (bestScore >= 25) risk = 'MEDIUM';

      setAuditResult({
        score: bestScore,
        duplicationRisk: risk,
        matchedVendor: bestMatchedVendor,
        breakdown: bestBreakdown,
      });
    } catch {
      setAuditResult({
        score: 0,
        duplicationRisk: 'LOW',
        matchedVendor: null,
      });
    } finally {
      setAuditLoading(false);
    }
  }, [companyName, contactEmail, contactPerson, contactPhone, contactCountryCode, invitations]);

  const executeSendInvite = useCallback(async () => {
    setShowPreSendConfidenceModal(false);
    setSending(true);
    setFormError(null);
    setSentSuccess('');
    try {
      const validItems = items
        .map((it) => ({ itemCode: it.itemCode.trim(), itemName: it.itemName.trim() }))
        .filter((it) => it.itemCode && it.itemName);
      const { invitation: inv, emailSent, message } = await procurementService.sendInvitation({
        companyName: companyName.trim(),
        contactEmail: contactEmail.trim(),
        contactPerson: contactPerson.trim() || undefined,
        contactPhone: contactPhone.trim() ? `${contactCountryCode}${contactPhone.trim()}` : undefined,
        category: selectedCategory.trim() || undefined,
        categoryId: selectedCategoryId || undefined,
        notes: notes.trim() || undefined,
        items: validItems.length > 0 ? validItems : undefined,
        documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
        ndaMndaRequired: (ndaRequired && mndaRequired) || undefined,
        ndaRequired: ndaRequired || undefined,
        mndaRequired: mndaRequired || undefined,
        anyOtherRequired: anyOtherRequired || undefined,
        ndaTemplateId: ndaTemplateId || undefined,
        mndaTemplateId: mndaTemplateId || undefined,
        anyOtherTemplateId: anyOtherTemplateId || undefined,
      });
      setCompanyName('');
      setContactEmail('');
      setContactPerson('');
      setContactPhone('');
      setSelectedCategory('');
      setSelectedCategoryId(null);
      setNotes('');
      setItems([]);
      setSelectedDocIds([]);
      setNdaRequired(false);
      setMndaRequired(false);
      setAnyOtherRequired(false);
      setNdaTemplateId(null);
      setMndaTemplateId(null);
      setAnyOtherTemplateId(null);
      setSelectedSearchVendor(null);
      hasShownDuplicateRef.current = false;
      continuedAsNewRef.current = false;
      reload();
      if (!emailSent) {
        setFormError(
          message ||
            `Vendor saved in queue but email was NOT sent to ${inv.contactEmail}. Check backend terminal for "Email failed" and verify Gmail App Password in .env`
        );
        setSentSuccess('');
      } else {
        setFormError(null);
        setSentSuccess(message || `Invitation email sent to ${inv.contactEmail} (Accept / Decline).`);
        setSentSuccessModal({
          companyName: inv.companyName,
          contactEmail: inv.contactEmail,
          inviteCode: inv.inviteCode,
          expiresAt: inv.expiresAt,
          itemsCount: validItems.length,
          documentsCount: selectedDocIds.length,
        });
      }
      setTimeout(() => setSentSuccess(''), 6000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  }, [companyName, contactEmail, contactPerson, contactPhone, contactCountryCode, notes, items, selectedDocIds, ndaRequired, mndaRequired, ndaTemplateId, mndaTemplateId, reload]);

  const handleCopyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }, []);

  const handleResend = useCallback(async (id: number) => {
    setFormError(null);
    try {
      await procurementService.resendInvitation(id);
      reload();
      setSentSuccess('Invitation email resent.');
      setTimeout(() => setSentSuccess(''), 4000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to resend invitation');
    }
  }, [reload]);

  const handleDelete = useCallback(async (id: number) => {
    setFormError(null);
    // Optimistic: hide from UI immediately
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      await procurementService.deleteInvitation(id);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete invitation');
      // Restore on failure
      setDeletingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  }, [reload]);

  const renderInvitationCard = (inv: VendorInvitationRow, compact: boolean) => {
    const st = statusConfig[inv.status];

    return (
      <div
        key={inv.id}
        className={`onb-invite-item ${compact ? '' : 'onb-invite-item--expanded-view'} onb-invite-item--clickable`}
        onClick={goToQueue}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') goToQueue(); }}
        title="View in Onboarding Queue"
      >
        <div className="onb-invite-item__top">
          <div className="onb-invite-item__info">
            <div className={`onb-invite-item__icon-box onb-invite-item__icon-box--${st.cls}`}>
              <Building2 size={16} />
            </div>
            <div className="onb-invite-item__details">
              <span className="onb-invite-item__name">
                {inv.companyName}
                {(inv.status === 'in_queue' || inv.status === 'approved') && (
                  <ExternalLink size={11} className="onb-invite-item__external-icon" />
                )}
              </span>
              <span className="onb-invite-item__email">
                <Mail size={11} />
                {inv.contactEmail}
              </span>
              {inv.contactPerson && (
                <span className="onb-invite-item__contact">
                  <Users size={11} />
                  {inv.contactPerson}
                </span>
              )}
              {inv.category && (
                <span className="onb-invite-item__contact" style={{ color: 'var(--primary-500)', fontWeight: 600 }}>
                  <Tag size={11} />
                  {inv.category}
                </span>
              )}
            </div>
          </div>
          <div className="onb-invite-item__meta">
            <span className={`onb-invite-badge onb-invite-badge--${st.cls}`}>
              {st.icon} {st.label}
            </span>
            <span className="onb-invite-item__date">Sent: {inv.sentAt}</span>
          </div>
        </div>



        <div className="onb-invite-item__bottom">
          <button type="button" className="onb-invite-code" onClick={(e) => { e.stopPropagation(); handleCopyCode(inv.inviteCode); }}>
            <span className="onb-invite-code__text">{inv.inviteCode}</span>
            {copiedCode === inv.inviteCode
              ? <CheckCircle2 size={12} className="onb-invite-code__copied" />
              : <Copy size={12} className="onb-invite-code__copy" />
            }
          </button>

          <div className="onb-invite-item__actions">
            <button
              type="button"
              className="onb-invite-action onb-invite-action--view"
              onClick={(e) => { e.stopPropagation(); setDetailInvitation(inv); }}
              title="View full invitation details"
            >
              <FileText size={12} /> View Details
            </button>
            {(inv.status === 'expired' || inv.status === 'pending') && (
              <button
                type="button"
                className="onb-invite-action onb-invite-action--resend"
                onClick={(e) => { e.stopPropagation(); handleResend(inv.id); }}
              >
                <RefreshCw size={12} /> Resend Email
              </button>
            )}
            {inv.status === 'pending' && (
              <button
                type="button"
                className="onb-invite-action onb-invite-action--delete"
                onClick={(e) => { e.stopPropagation(); handleDelete(inv.id); }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const visibleInvitations = useMemo(
    () => invitations.filter((inv) => !deletingIds.has(inv.id)),
    [invitations, deletingIds]
  );

  const sentInvitationsContent = loading ? (
    <div className="onb-list-empty">
      <p className="onb-list-empty__desc">Loading invitations…</p>
    </div>
  ) : visibleInvitations.length === 0 ? (
    <div className="onb-list-empty">
      <Send size={40} />
      <p className="onb-list-empty__title">No invitations sent yet</p>
      <p className="onb-list-empty__desc">Use the form to invite a supplier</p>
    </div>
  ) : (
    <div className="onb-list-items">
      {visibleInvitations.map((inv) => renderInvitationCard(inv, true))}
      {/* Show deleting items with reduced opacity */}
      {invitations.filter((inv) => deletingIds.has(inv.id)).map((inv) => (
        <div key={inv.id} className="onb-invite-item" style={{ opacity: 0.35, pointerEvents: 'none' }}>
          <div className="onb-invite-item__top">
            <div className="onb-invite-item__info">
              <div className="onb-invite-item__icon-box onb-invite-item__icon-box--pending">
                <Building2 size={16} />
              </div>
              <div className="onb-invite-item__details">
                <span className="onb-invite-item__name">{inv.companyName}</span>
                <span className="onb-invite-item__email"><Mail size={11} /> {inv.contactEmail}</span>
              </div>
            </div>
          </div>
          <div style={{ padding: '8px 16px', fontSize: 12, color: '#9ea4a9' }}>Deleting…</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="onb-page">
      <div className="onb-page__header">
        <div className="onb-page__header-left">
          <h1>New Onboarding</h1>
          <p>Send invitations to suppliers — they register and enter the approval queue</p>
        </div>
      </div>

      {(error || formError) && (
        <MessageStrip type="error" onClose={() => setFormError(null)}>
          {formError || error}
        </MessageStrip>
      )}

      <div className="onb-kpi-row">
        {[
          { label: 'Invitations Sent', value: invitations.length, cls: 'blue' },
          { label: 'Waiting for user response', value: pendingCount, cls: 'amber' },
          { label: 'In Approval Queue', value: inQueueCount, cls: 'green' },
        ].map((k) => (
          <div key={k.label} className="onb-kpi-card">
            <span className="onb-kpi-card__label">{k.label}</span>
            <span className={`onb-kpi-card__value onb-kpi-card__value--${k.cls}`}>{k.value}</span>
          </div>
        ))}
      </div>

      <div className="onb-content">
        <div className="onb-form-section">
          {isInviteExpanded && (
            <div className="onb-form-card-backdrop" onClick={() => setIsInviteExpanded(false)} />
          )}

          <div className={`onb-form-card ${isInviteExpanded ? 'onb-form-card--expanded' : ''}`}>
            <div className="onb-form-card__header">
              <div className="onb-form-card__header-icon">
                <Send size={16} />
              </div>
              <div className="onb-form-card__header-copy">
                <h2 className="onb-form-card__header-title">Send Invitation</h2>
                <p className="onb-form-card__header-sub">Invite a supplier to register</p>
              </div>
              <button
                type="button"
                className="onb-form-card__expand-btn"
                onClick={() => setIsInviteExpanded((expanded) => !expanded)}
                title={isInviteExpanded ? 'Restore' : 'Expand'}
                aria-label={isInviteExpanded ? 'Restore invitation form' : 'Expand invitation form'}
              >
                {isInviteExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>

            <form onSubmit={handleSendInviteClick} className="onb-form-card__body">
              {sentSuccess && (
                <MessageStrip type="success" compact onClose={() => setSentSuccess('')} autoHideMs={4000}>
                  {sentSuccess}
                </MessageStrip>
              )}

              <div className="onb-form-field">
                <label className="onb-form-field__label">
                  Company Name <span>*</span>
                  {searchLoading && <span className="onb-search-spinner" />}
                </label>
                <div className="onb-form-field__input-wrap">
                  <Building2 size={16} className="onb-form-field__icon" />
                  <input
                    ref={companyNameRef}
                    type="text"
                    value={companyName}
                    onChange={handleCompanyNameChange}
                    onFocus={() => {
                      if (searchResults.length > 0 && companyName.trim().length >= 2 && !continuedAsNewRef.current) {
                        setShowSuggestions(true);
                      }
                    }}
                    onBlur={handleCompanyNameBlur}
                    placeholder="e.g. Aztech Components Ltd"
                    required
                    autoComplete="off"
                    className="onb-form-field__input"
                  />
                </div>

                {/* Vendor Search Suggestions Dropdown */}
                <VendorSuggestDropdown
                  query={companyName}
                  results={searchResults}
                  loading={searchLoading}
                  hasSearched={hasSearched}
                  onSelect={handleSelectSearchResult}
                  onClose={handleCloseSuggestions}
                  anchorRef={companyNameRef}
                  visible={showSuggestions}
                />
              </div>

              <div className="onb-form-field">
                <label className="onb-form-field__label">Vendor Email <span>*</span></label>
                <div className="onb-form-field__input-wrap">
                  <Mail size={16} className="onb-form-field__icon" />
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="vendor@company.com"
                    required
                    className="onb-form-field__input"
                  />
                </div>
              </div>

              <div className="onb-form-field">
                <label className="onb-form-field__label">Contact Person</label>
                <div className="onb-form-field__input-wrap">
                  <Users size={16} className="onb-form-field__icon" />
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="Full name"
                    className="onb-form-field__input"
                  />
                </div>
              </div>

              <div className="onb-form-field">
                <label className="onb-form-field__label">Phone Number</label>
                <PhoneInput
                  countryCode={contactCountryCode}
                  onCountryCodeChange={setContactCountryCode}
                  value={contactPhone}
                  onChange={setContactPhone}
                  hasError={isPhoneInvalid}
                  placeholder="Type your mobile number"
                />
                {isPhoneInvalid && (
                  <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                    Please enter a valid phone number (7 to 15 digits)
                  </span>
                )}
              </div>

              <div className="onb-form-field">
                <label className="onb-form-field__label">Vendor Category</label>
                <div className="onb-form-field__input-wrap">
                  <Tag size={16} className="onb-form-field__icon" />
                  <select
                    value={selectedCategoryId || (categories.some((c) => c.name === selectedCategory) ? categories.find((c) => c.name === selectedCategory)?.id : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      const catObj = categories.find((c) => c.id === val);
                      if (catObj) {
                        setSelectedCategory(catObj.name);
                        setSelectedCategoryId(catObj.id);
                      } else {
                        setSelectedCategory('');
                        setSelectedCategoryId(null);
                      }
                    }}
                    className="onb-form-field__input"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select Vendor Category (optional)</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="onb-form-field">
                <label className="onb-form-field__label">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Preferred IT hardware supplier..."
                  className="onb-form-field__textarea"
                />
              </div>

              {/* Items — Compact Summary + Popup Trigger */}
              <div className="onb-items-bar">
                <div className="onb-items-bar__left">
                  <Package size={15} />
                  <span className="onb-items-bar__label">Required Items</span>
                  {items.length > 0 && (
                    <span className="onb-items-bar__count">{items.length}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="onb-items-bar__btn"
                  ref={itemsBarBtnRef}
                  onClick={() => setShowItemsPopup(true)}
                >
                  <Plus size={14} />
                  {items.length === 0 ? 'Add Items' : `Edit Items (${items.length})`}
                </button>
              </div>

              {items.length > 0 && (
                <div className="onb-items-preview">
                  {items.slice(0, 4).map((item, idx) => (
                    <span key={idx} className="onb-items-preview__chip">
                      <span className="onb-items-preview__code">{item.itemCode || '?'}</span>
                      <span className="onb-items-preview__name">{item.itemName || 'Unnamed'}</span>
                    </span>
                  ))}
                  {items.length > 4 && (
                    <span className="onb-items-preview__more">+{items.length - 4} more</span>
                  )}
                </div>
              )}

              {/* ── Legal Documents Section (NDA & MNDA) — Dropdown Style ── */}
              {(() => {
                const legalOpen = [ndaRequired, mndaRequired, anyOtherRequired];
                const selectedCount = legalOpen.filter(Boolean).length;
                return (
                  <div className="onb-legal-docs-section">
                    <button
                      type="button"
                      className="onb-legal-docs-section__header onb-legal-docs-section__header--btn"
                      onClick={() => setLegalDocsOpen(o => !o)}
                      aria-expanded={legalDocsOpen}
                    >
                      <ShieldCheck size={15} className="onb-legal-docs-section__header-icon" />
                      <span className="onb-legal-docs-section__header-title">Legal Documents</span>
                      {selectedCount > 0 && (
                        <span className="onb-legal-docs-section__count-badge">{selectedCount} selected</span>
                      )}
                      <ChevronDown
                        size={15}
                        className={`onb-legal-docs-section__chevron ${legalDocsOpen ? 'onb-legal-docs-section__chevron--open' : ''}`}
                      />
                    </button>

                    {legalDocsOpen && (
                      <div className="onb-legal-docs-dropdown">
                        {/* NDA Row */}
                        <div className={`onb-legal-doc-row ${ndaRequired ? 'onb-legal-doc-row--active' : ''}`}>
                          <div className="onb-legal-doc-row__left">
                            <label className="onb-legal-doc-row__toggle">
                              <input
                                type="checkbox"
                                checked={ndaRequired}
                                onChange={(e) => {
                                  setNdaRequired(e.target.checked);
                                  if (e.target.checked) {
                                    setNdaTemplateId(null);
                                    handleOpenNdaTemplateModal();
                                  } else {
                                    setNdaTemplateId(null);
                                  }
                                }}
                                className="onb-nda-checkbox"
                              />
                              <div className="onb-legal-doc-row__info">
                                <span className="onb-legal-doc-row__name">NDA Agreement</span>
                                <span className="onb-legal-doc-row__desc">Non-Disclosure Agreement</span>
                              </div>
                            </label>
                          </div>
                          <div className="onb-legal-doc-row__right">
                            {ndaRequired && (
                              <>
                                {ndaTemplateId ? (
                                  <span className="onb-legal-doc-row__selected-badge">
                                    <FileText size={11} />
                                    {ndaTemplates.find(t => t.id === ndaTemplateId)?.name || 'Template Selected'}
                                  </span>
                                ) : (
                                  <span className="onb-legal-doc-row__warn">No template selected</span>
                                )}
                                <button
                                  type="button"
                                  className="onb-legal-doc-row__choose-btn"
                                  onClick={handleOpenNdaTemplateModal}
                                >
                                  {ndaTemplateId ? 'Change' : 'Choose Template'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* MNDA Row */}
                        <div className={`onb-legal-doc-row ${mndaRequired ? 'onb-legal-doc-row--active' : ''}`}>
                          <div className="onb-legal-doc-row__left">
                            <label className="onb-legal-doc-row__toggle">
                              <input
                                type="checkbox"
                                checked={mndaRequired}
                                onChange={(e) => {
                                  setMndaRequired(e.target.checked);
                                  if (e.target.checked) {
                                    setMndaTemplateId(null);
                                    handleOpenMndaTemplateModal();
                                  } else {
                                    setMndaTemplateId(null);
                                  }
                                }}
                                className="onb-nda-checkbox"
                              />
                              <div className="onb-legal-doc-row__info">
                                <span className="onb-legal-doc-row__name">MNDA Agreement</span>
                                <span className="onb-legal-doc-row__desc">Mutual Non-Disclosure Agreement</span>
                              </div>
                            </label>
                          </div>
                          <div className="onb-legal-doc-row__right">
                            {mndaRequired && (
                              <>
                                {mndaTemplateId ? (
                                  <span className="onb-legal-doc-row__selected-badge">
                                    <FileText size={11} />
                                    {mndaTemplates.find(t => t.id === mndaTemplateId)?.name || 'Template Selected'}
                                  </span>
                                ) : (
                                  <span className="onb-legal-doc-row__warn">No template selected</span>
                                )}
                                <button
                                  type="button"
                                  className="onb-legal-doc-row__choose-btn"
                                  onClick={handleOpenMndaTemplateModal}
                                >
                                  {mndaTemplateId ? 'Change' : 'Choose Template'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Any Other Row */}
                        <div className={`onb-legal-doc-row ${anyOtherRequired ? 'onb-legal-doc-row--active' : ''}`}>
                          <div className="onb-legal-doc-row__left">
                            <label className="onb-legal-doc-row__toggle">
                              <input
                                type="checkbox"
                                checked={anyOtherRequired}
                                onChange={(e) => {
                                  setAnyOtherRequired(e.target.checked);
                                  if (e.target.checked) {
                                    setAnyOtherTemplateId(null);
                                    handleOpenAnyOtherTemplateModal();
                                  } else {
                                    setAnyOtherTemplateId(null);
                                  }
                                }}
                                className="onb-nda-checkbox"
                              />
                              <div className="onb-legal-doc-row__info">
                                <span className="onb-legal-doc-row__name">Any Other Agreement</span>
                                <span className="onb-legal-doc-row__desc">Other legal / compliance document</span>
                              </div>
                            </label>
                          </div>
                          <div className="onb-legal-doc-row__right">
                            {anyOtherRequired && (
                              <>
                                {anyOtherTemplateId ? (
                                  <span className="onb-legal-doc-row__selected-badge">
                                    <FileText size={11} />
                                    {anyOtherTemplates.find(t => t.id === anyOtherTemplateId)?.name || 'Template Selected'}
                                  </span>
                                ) : (
                                  <span className="onb-legal-doc-row__warn">No template selected</span>
                                )}
                                <button
                                  type="button"
                                  className="onb-legal-doc-row__choose-btn"
                                  onClick={handleOpenAnyOtherTemplateModal}
                                >
                                  {anyOtherTemplateId ? 'Change' : 'Choose Template'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Documents — Compact Summary + Popup Trigger */}
              <div className="onb-items-bar">
                <div className="onb-items-bar__left">
                  <FileText size={15} />
                  <span className="onb-items-bar__label">Required Documents</span>
                  {selectedDocIds.length > 0 && (
                    <span className="onb-items-bar__count">{selectedDocIds.length}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="onb-items-bar__btn"
                  ref={docsBarBtnRef}
                  onClick={handleOpenDocsPopup}
                >
                  <Plus size={14} />
                  {selectedDocIds.length === 0 ? 'Select Documents' : `Edit (${selectedDocIds.length})`}
                </button>
              </div>

              {selectedDocNames.length > 0 && (
                <div className="onb-items-preview">
                  {selectedDocNames.slice(0, 6).map((name, idx) => (
                    <span key={idx} className="onb-items-preview__chip">
                      <FileText size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                      <span className="onb-items-preview__name">{name}</span>
                    </span>
                  ))}
                  {selectedDocNames.length > 6 && (
                    <span className="onb-items-preview__more">+{selectedDocNames.length - 6} more</span>
                  )}
                </div>
              )}

              <div className="onb-form-info">
                <Info size={16} className="onb-form-info__icon" />
                <p>
                  Vendor receives a professional invitation email with <strong>Accept</strong> and{' '}
                  <strong>Decline</strong> buttons.{items.length > 0 && ' Items will be included in the email and as a downloadable Excel attachment.'} After they accept, they appear in{' '}
                  <strong>Onboarding Queue</strong> for your approval.
                </p>
              </div>

              <button type="submit" disabled={sending} className="onb-form-submit">
                {sending ? (
                  <span className="onb-form-submit__pulse">Sending...</span>
                ) : (
                  <><Send size={16} /> Send Invitation Email</>
                )}
              </button>
            </form>
          </div>

          {/* ── Desktop-style Required Items Window ── */}
          <DesktopWindow
            open={showItemsPopup}
            onClose={() => { setShowItemsPopup(false); setItemsMinimized(false); }}
            onMinimize={() => setItemsMinimized(true)}
            minimized={itemsMinimized}
            onRestore={() => setItemsMinimized(false)}
            title="Required Items"
            icon={<Package size={16} />}
            defaultWidth={760}
            defaultHeight={560}
            minWidth={480}
            minHeight={320}
            hasUnsavedChanges={items.some(item => item.itemCode.trim() || item.itemName.trim())}
            confirmMessage="You have items with data entered. Discard changes?"
            restoreFocusRef={itemsBarBtnRef}
            footer={
              <>
                <button type="button" className="onb-popup-add-btn" onClick={addItem}>
                  <Plus size={14} /> Add Item
                </button>
                <button
                  type="button"
                  className="onb-popup-done-btn"
                  onClick={() => { setShowItemsPopup(false); setItemsMinimized(false); }}
                >
                  Done ({items.length})
                </button>
              </>
            }
          >
            {items.length > 0 ? (
              <>
                <div className="onb-popup-table">
                  <div className="onb-popup-table__head">
                    <span className="onb-popup-table__col onb-popup-table__col--code">Item Code</span>
                    <span className="onb-popup-table__col onb-popup-table__col--name">Item Name</span>
                    <span className="onb-popup-table__col onb-popup-table__col--action"></span>
                  </div>
                  {items.map((item, idx) => (
                    <div key={idx} className="onb-popup-table__row">
                      <div className="onb-popup-table__col onb-popup-table__col--code">
                        <div className="onb-popup-input-wrap">
                          <Hash size={13} className="onb-popup-input-icon" />
                          <input
                            type="text"
                            value={item.itemCode}
                            onChange={(e) => updateItem(idx, 'itemCode', e.target.value)}
                            placeholder="e.g. MAT-001"
                            className="onb-popup-input"
                            autoFocus={idx === items.length - 1}
                          />
                        </div>
                      </div>
                      <div className="onb-popup-table__col onb-popup-table__col--name">
                        <div className="onb-popup-input-wrap">
                          <Package size={13} className="onb-popup-input-icon" />
                          <input
                            type="text"
                            value={item.itemName}
                            onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                            placeholder="e.g. Steel Rod 10mm"
                            className="onb-popup-input"
                          />
                        </div>
                      </div>
                      <div className="onb-popup-table__col onb-popup-table__col--action">
                        <button
                          type="button"
                          className="onb-popup-remove-btn"
                          onClick={() => removeItem(idx)}
                          title="Remove item"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="onb-popup-body-add-btn"
                  onClick={addItem}
                >
                  <Plus size={14} /> Add Another Item
                </button>
              </>
            ) : (
              <div className="onb-popup-empty">
                <Package size={28} />
                <p className="onb-popup-empty__title">No items added</p>
                <p className="onb-popup-empty__desc">Start by adding your first required item.</p>
                <button
                  type="button"
                  className="onb-popup-body-add-btn onb-popup-body-add-btn--centered"
                  onClick={addItem}
                >
                  <Plus size={16} /> Add First Item
                </button>
              </div>
            )}
          </DesktopWindow>

          {/* ── Desktop-style Document Selection Window ── */}
          <DesktopWindow
            open={showDocsPopup}
            onClose={() => { setShowDocsPopup(false); setDocsMinimized(false); }}
            onMinimize={() => setDocsMinimized(true)}
            minimized={docsMinimized}
            onRestore={() => setDocsMinimized(false)}
            title="Select Required Documents"
            icon={<FileText size={16} />}
            defaultWidth={640}
            defaultHeight={520}
            minWidth={400}
            minHeight={300}
            hasUnsavedChanges={selectedDocIds.length > 0}
            confirmMessage="Discard document selection?"
            restoreFocusRef={docsBarBtnRef}
            footer={
              <button
                type="button"
                className="onb-popup-done-btn"
                onClick={() => { setShowDocsPopup(false); setDocsMinimized(false); }}
              >
                Done ({selectedDocIds.length} selected)
              </button>
            }
          >
            {docsLoading ? (
              <div className="onb-popup-empty">
                <p className="onb-popup-empty__desc">Loading documents...</p>
              </div>
            ) : availableDocs.length === 0 ? (
              <div className="onb-popup-empty">
                <FileText size={28} />
                <p className="onb-popup-empty__title">No documents configured</p>
                <p className="onb-popup-empty__desc">Add Required and Optional documents in Company Settings first.</p>
              </div>
            ) : (
              <div className="onb-doc-select">
                {/* Mandatory Documents */}
                {mandatoryDocs.length > 0 && (
                  <>
                    <div className="onb-doc-select__group-label">
                      <span className="onb-doc-select__badge onb-doc-select__badge--required">Mandatory</span>
                      {mandatoryDocs.length} document{mandatoryDocs.length !== 1 ? 's' : ''}
                    </div>
                    {mandatoryDocs.map(doc => (
                      <div key={doc.id} className={`onb-doc-select__item ${selectedDocIds.includes(doc.id) ? 'onb-doc-select__item--selected' : ''}`}>
                        <label className="onb-doc-select__item-label" onClick={() => toggleDocSelection(doc.id)}>
                          <input
                            type="checkbox"
                            checked={selectedDocIds.includes(doc.id)}
                            onChange={() => toggleDocSelection(doc.id)}
                            className="onb-doc-select__checkbox"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <FileText size={15} className="onb-doc-select__icon" />
                          <div className="onb-doc-select__name-wrap">
                            <span className="onb-doc-select__name">{doc.name}</span>
                            {doc.description && (
                              <span className="onb-doc-select__desc">{doc.description}</span>
                            )}
                            {doc.acceptedFileTypes && (
                              <span className="onb-doc-select__filetypes">{doc.acceptedFileTypes}</span>
                            )}
                          </div>
                        </label>
                        <button
                          type="button"
                          className="onb-template-preview-btn"
                          onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
                          title="Preview document info"
                        >
                          <Eye size={12} /> Preview
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {/* Optional Documents */}
                {optionalDocs.length > 0 && (
                  <>
                    <div className="onb-doc-select__group-label" style={{ marginTop: 16 }}>
                      <span className="onb-doc-select__badge onb-doc-select__badge--optional">Optional</span>
                      {optionalDocs.length} document{optionalDocs.length !== 1 ? 's' : ''}
                    </div>
                    {optionalDocs.map(doc => (
                      <div key={doc.id} className={`onb-doc-select__item ${selectedDocIds.includes(doc.id) ? 'onb-doc-select__item--selected' : ''}`}>
                        <label className="onb-doc-select__item-label" onClick={() => toggleDocSelection(doc.id)}>
                          <input
                            type="checkbox"
                            checked={selectedDocIds.includes(doc.id)}
                            onChange={() => toggleDocSelection(doc.id)}
                            className="onb-doc-select__checkbox"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <FileText size={15} className="onb-doc-select__icon" />
                          <div className="onb-doc-select__name-wrap">
                            <span className="onb-doc-select__name">{doc.name}</span>
                            {doc.description && (
                              <span className="onb-doc-select__desc">{doc.description}</span>
                            )}
                            {doc.acceptedFileTypes && (
                              <span className="onb-doc-select__filetypes">{doc.acceptedFileTypes}</span>
                            )}
                          </div>
                        </label>
                        <button
                          type="button"
                          className="onb-template-preview-btn"
                          onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
                          title="Preview document info"
                        >
                          <Eye size={12} /> Preview
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {/* Any Other Documents */}
                {anyOtherDocs.length > 0 && (
                  <>
                    <div className="onb-doc-select__group-label" style={{ marginTop: 16 }}>
                      <span className="onb-doc-select__badge onb-doc-select__badge--optional">Any Other</span>
                      {anyOtherDocs.length} document{anyOtherDocs.length !== 1 ? 's' : ''}
                    </div>
                    {anyOtherDocs.map(doc => (
                      <div key={doc.id} className={`onb-doc-select__item ${selectedDocIds.includes(doc.id) ? 'onb-doc-select__item--selected' : ''}`}>
                        <label className="onb-doc-select__item-label" onClick={() => toggleDocSelection(doc.id)}>
                          <input
                            type="checkbox"
                            checked={selectedDocIds.includes(doc.id)}
                            onChange={() => toggleDocSelection(doc.id)}
                            className="onb-doc-select__checkbox"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <FileText size={15} className="onb-doc-select__icon" />
                          <div className="onb-doc-select__name-wrap">
                            <span className="onb-doc-select__name">{doc.name}</span>
                            {doc.description && (
                              <span className="onb-doc-select__desc">{doc.description}</span>
                            )}
                            {doc.acceptedFileTypes && (
                              <span className="onb-doc-select__filetypes">{doc.acceptedFileTypes}</span>
                            )}
                          </div>
                        </label>
                        <button
                          type="button"
                          className="onb-template-preview-btn"
                          onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
                          title="Preview document info"
                        >
                          <Eye size={12} /> Preview
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </DesktopWindow>

          {/* ── Desktop-style NDA Template Selection Window ── */}
          <DesktopWindow
            open={showNdaTemplateModal}
            onClose={() => { setShowNdaTemplateModal(false); if (!ndaTemplateId) setNdaRequired(false); }}
            title="Select NDA Template"
            icon={<FileText size={16} />}
            defaultWidth={540}
            defaultHeight={420}
            minWidth={380}
            minHeight={280}
            footer={
              <button
                type="button"
                className="onb-popup-done-btn"
                onClick={() => { setShowNdaTemplateModal(false); if (!ndaTemplateId) setNdaRequired(false); }}
              >
                {ndaTemplateId ? 'Done' : 'Cancel'}
              </button>
            }
          >
            {ndaTemplatesLoading ? (
              <div className="onb-popup-empty">
                <p className="onb-popup-empty__desc">Loading templates...</p>
              </div>
            ) : ndaTemplates.length === 0 ? (
              <div className="onb-popup-empty">
                <FileText size={28} />
                <p className="onb-popup-empty__title">No NDA templates configured</p>
                <p className="onb-popup-empty__desc">Add NDA templates in Company Settings first.</p>
              </div>
            ) : (
              <div className="onb-doc-select">
                {ndaTemplates.map(template => {
                  const isSelected = ndaTemplateId === template.id;
                  return (
                    <label
                      key={template.id}
                      className={`onb-doc-select__item ${isSelected ? 'onb-doc-select__item--selected' : ''}`}
                      onClick={() => handleSelectNdaTemplate(template.id)}
                    >
                      <input
                        type="radio"
                        name="ndaTemplate"
                        checked={isSelected}
                        onChange={() => handleSelectNdaTemplate(template.id)}
                        className="onb-doc-select__checkbox"
                      />
                      <FileText size={15} className="onb-doc-select__icon" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="onb-doc-select__name">{template.name}</div>
                        {template.fileUrl && (
                          <div style={{ fontSize: 11, color: '#9ea4a9', marginTop: 2 }}>
                            Uploaded document available
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="onb-template-preview-btn"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); handlePreviewTemplate(template); }}
                        title="Preview template content"
                      >
                        Preview
                      </button>
                    </label>
                  );
                })}
              </div>
            )}
          </DesktopWindow>

          {/* ── Desktop-style MNDA Template Selection Window ── */}
          <DesktopWindow
            open={showMndaTemplateModal}
            onClose={() => { setShowMndaTemplateModal(false); if (!mndaTemplateId) setMndaRequired(false); }}
            title="Select MNDA Template"
            icon={<FileText size={16} />}
            defaultWidth={540}
            defaultHeight={420}
            minWidth={380}
            minHeight={280}
            footer={
              <button
                type="button"
                className="onb-popup-done-btn"
                onClick={() => { setShowMndaTemplateModal(false); if (!mndaTemplateId) setMndaRequired(false); }}
              >
                {mndaTemplateId ? 'Done' : 'Cancel'}
              </button>
            }
          >
            {ndaTemplatesLoading ? (
              <div className="onb-popup-empty">
                <p className="onb-popup-empty__desc">Loading templates...</p>
              </div>
            ) : mndaTemplates.length === 0 ? (
              <div className="onb-popup-empty">
                <FileText size={28} />
                <p className="onb-popup-empty__title">No MNDA templates configured</p>
                <p className="onb-popup-empty__desc">Add MNDA templates in Company Settings first.</p>
              </div>
            ) : (
              <div className="onb-doc-select">
                {mndaTemplates.map(template => {
                  const isSelected = mndaTemplateId === template.id;
                  return (
                    <label
                      key={template.id}
                      className={`onb-doc-select__item ${isSelected ? 'onb-doc-select__item--selected' : ''}`}
                      onClick={() => handleSelectMndaTemplate(template.id)}
                    >
                      <input
                        type="radio"
                        name="mndaTemplate"
                        checked={isSelected}
                        onChange={() => handleSelectMndaTemplate(template.id)}
                        className="onb-doc-select__checkbox"
                      />
                      <FileText size={15} className="onb-doc-select__icon" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="onb-doc-select__name">{template.name}</div>
                        {template.fileUrl && (
                          <div style={{ fontSize: 11, color: '#9ea4a9', marginTop: 2 }}>
                            Uploaded document available
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="onb-template-preview-btn"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); handlePreviewTemplate(template); }}
                        title="Preview template content"
                      >
                        Preview
                      </button>
                    </label>
                  );
                })}
              </div>
            )}
          </DesktopWindow>

          {/* ── Desktop-style Any Other Template Selection Window ── */}
          <DesktopWindow
            open={showAnyOtherTemplateModal}
            onClose={() => { setShowAnyOtherTemplateModal(false); if (!anyOtherTemplateId) setAnyOtherRequired(false); }}
            title="Select Any Other Agreement Template"
            icon={<FileText size={16} />}
            defaultWidth={540}
            defaultHeight={420}
            minWidth={380}
            minHeight={280}
            footer={
              <button
                type="button"
                className="onb-popup-done-btn"
                onClick={() => { setShowAnyOtherTemplateModal(false); if (!anyOtherTemplateId) setAnyOtherRequired(false); }}
              >
                {anyOtherTemplateId ? 'Done' : 'Cancel'}
              </button>
            }
          >
            {ndaTemplatesLoading ? (
              <div className="onb-popup-empty">
                <p className="onb-popup-empty__desc">Loading templates...</p>
              </div>
            ) : anyOtherTemplates.length === 0 ? (
              <div className="onb-popup-empty">
                <FileText size={28} />
                <p className="onb-popup-empty__title">No "Any Other" templates configured</p>
                <p className="onb-popup-empty__desc">Add Any Other templates in Company Settings first.</p>
              </div>
            ) : (
              <div className="onb-doc-select">
                {anyOtherTemplates.map(template => {
                  const isSelected = anyOtherTemplateId === template.id;
                  return (
                    <label
                      key={template.id}
                      className={`onb-doc-select__item ${isSelected ? 'onb-doc-select__item--selected' : ''}`}
                      onClick={() => handleSelectAnyOtherTemplate(template.id)}
                    >
                      <input
                        type="radio"
                        name="anyOtherTemplate"
                        checked={isSelected}
                        onChange={() => handleSelectAnyOtherTemplate(template.id)}
                        className="onb-doc-select__checkbox"
                      />
                      <FileText size={15} className="onb-doc-select__icon" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="onb-doc-select__name">{template.name}</div>
                        {template.fileUrl && (
                          <div style={{ fontSize: 11, color: '#9ea4a9', marginTop: 2 }}>
                            Uploaded document available
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="onb-template-preview-btn"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); handlePreviewTemplate(template); }}
                        title="Preview template content"
                      >
                        Preview
                      </button>
                    </label>
                  );
                })}
              </div>
            )}
          </DesktopWindow>

          {/* ── Template Preview Overlay ── */}
          {showTemplatePreview && previewTemplate && (

            <div
              className="onb-template-preview-overlay"
              onClick={() => setShowTemplatePreview(false)}
            >
              <div
                className="onb-template-preview-card"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="onb-template-preview-header">
                  <div className="onb-template-preview-header__left">
                    <FileText size={18} />
                    <div>
                      <div className="onb-template-preview-header__title">{previewTemplate.name}</div>
                      <div className="onb-template-preview-header__sub">
                        {previewTemplate.type} Template · v{previewTemplate.version}
                        {previewTemplate.fileName && ` · ${previewTemplate.fileName}`}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="onb-template-preview-close"
                    onClick={() => setShowTemplatePreview(false)}
                    aria-label="Close preview"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="onb-template-preview-body">
                  {previewTemplate.content ? (
                    <div
                      className="onb-template-preview-content"
                      dangerouslySetInnerHTML={{ __html: previewTemplate.content }}
                    />
                  ) : (
                    <div className="onb-popup-empty">
                      <FileText size={28} />
                      <p className="onb-popup-empty__title">No content available</p>
                      <p className="onb-popup-empty__desc">This template has no content defined.</p>
                    </div>
                  )}
                </div>
                <div className="onb-template-preview-footer">
                  <button
                    type="button"
                    className="onb-popup-done-btn"
                    onClick={() => setShowTemplatePreview(false)}
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      {/* ── Required Document Preview Modal ── */}
      {previewDoc && (
        <div
          className="onb-template-preview-overlay"
          onClick={() => setPreviewDoc(null)}
          style={{ zIndex: 12000 }}
        >
          <div
            className="onb-template-preview-card"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="onb-template-preview-header">
              <div className="onb-template-preview-header__left">
                <FileText size={18} />
                <div>
                  <div className="onb-template-preview-header__title">{previewDoc.name}</div>
                  <div className="onb-template-preview-header__sub">
                    {previewDoc.documentCategory === 'mandatory' ? 'Mandatory' : previewDoc.documentCategory === 'optional' ? 'Optional' : 'Any Other'} Document
                    {previewDoc.fieldType && ` · ${previewDoc.fieldType}`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="onb-template-preview-close"
                onClick={() => setPreviewDoc(null)}
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>
            <div className="onb-template-preview-body" style={{ minHeight: 180 }}>
              {previewDoc.description ? (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-placeholder)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Description</div>
                  <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>{previewDoc.description}</p>
                </div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic', margin: 0 }}>No description provided for this document.</p>
                </div>
              )}
              {previewDoc.acceptedFileTypes && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-placeholder)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Accepted File Types</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {previewDoc.acceptedFileTypes.split(',').map((ft, i) => (
                      <span
                        key={i}
                        style={{
                          display: 'inline-flex', alignItems: 'center',
                          padding: '3px 10px', borderRadius: 20,
                          background: 'rgba(10,110,209,0.08)',
                          border: '1px solid rgba(10,110,209,0.2)',
                          color: 'var(--primary-500)',
                          fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        }}
                      >
                        .{ft.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 'var(--radius-md)',
                background: selectedDocIds.includes(previewDoc.id)
                  ? 'rgba(16,185,129,0.08)' : 'var(--surface-elevated)',
                border: `1px solid ${
                  selectedDocIds.includes(previewDoc.id) ? 'rgba(16,185,129,0.25)' : 'var(--border)'
                }`,
                marginTop: 8,
              }}>
                <input
                  type="checkbox"
                  checked={selectedDocIds.includes(previewDoc.id)}
                  onChange={() => toggleDocSelection(previewDoc.id)}
                  style={{ width: 16, height: 16, accentColor: 'var(--primary-500)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedDocIds.includes(previewDoc.id) ? '✓ Selected for this invitation' : 'Select this document for the invitation'}
                </span>
              </div>
            </div>
            <div className="onb-template-preview-footer" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-placeholder)' }}>
                Category: <strong style={{ color: 'var(--text-secondary)' }}>
                  {previewDoc.documentCategory === 'mandatory' ? 'Mandatory' : previewDoc.documentCategory === 'optional' ? 'Optional' : 'Any Other'}
                </strong>
              </span>
              <button
                type="button"
                className="onb-popup-done-btn"
                onClick={() => setPreviewDoc(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invitation Detail Popup ── */}
      {detailInvitation && (
        <div
          className="onb-detail-backdrop"
          onClick={() => setDetailInvitation(null)}
        >
          <div
            className="onb-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="onb-detail-header">
              <div className="onb-detail-header__icon">
                <FileText size={22} />
              </div>
              <div className="onb-detail-header__copy">
                <h3 className="onb-detail-header__title">
                  {detailInvitation.companyName}
                </h3>
                <p className="onb-detail-header__sub">
                  Invitation Details
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailInvitation(null)}
                className="onb-detail-close-btn"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="onb-detail-body">
              {/* Status & Dates */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <span className={`onb-invite-badge onb-invite-badge--${statusConfig[detailInvitation.status].cls}`}>
                  {statusConfig[detailInvitation.status].icon} {statusConfig[detailInvitation.status].label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-placeholder)' }}>
                  Sent: {detailInvitation.sentAt}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-placeholder)' }}>
                  Expires: {detailInvitation.expiresAt}
                </span>
              </div>

              {/* Company Info */}
              <div className="onb-detail-section">
                <div className="onb-detail-section__label">
                  Contact Information
                </div>
                <div className="onb-detail-info-grid">
                  <div>
                    <div className="onb-detail-info-grid__label">Email</div>
                    <div className="onb-detail-info-grid__value">{detailInvitation.contactEmail}</div>
                  </div>
                  {detailInvitation.contactPerson && (
                    <div>
                      <div className="onb-detail-info-grid__label">Contact Person</div>
                      <div className="onb-detail-info-grid__value">{detailInvitation.contactPerson}</div>
                    </div>
                  )}
                  {detailInvitation.category && (
                    <div>
                      <div className="onb-detail-info-grid__label">Vendor Category</div>
                      <div className="onb-detail-info-grid__value">{detailInvitation.category}</div>
                    </div>
                  )}
                  <div>
                    <div className="onb-detail-info-grid__label">Invite Code</div>
                    <div className="onb-detail-info-grid__value onb-detail-info-grid__value--mono">{detailInvitation.inviteCode}</div>
                  </div>
                </div>
              </div>

              {/* Items */}
              {detailInvitation.items && detailInvitation.items.length > 0 && (
                <div className="onb-detail-section">
                  <div className="onb-detail-items-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Package size={14} />
                      <span className="onb-detail-items-header__title">
                        Items ({detailInvitation.items.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      className="onb-eye-view-btn"
                      onClick={() => setEyeViewModal({
                        type: 'items',
                        companyName: detailInvitation.companyName,
                        items: detailInvitation.items || [],
                      })}
                      title="Open preview popup window"
                    >
                      <Eye size={13} />
                      <span>Eye View</span>
                    </button>
                  </div>

                  <div
                    className="onb-eye-view-placeholder"
                    onClick={() => setEyeViewModal({
                      type: 'items',
                      companyName: detailInvitation.companyName,
                      items: detailInvitation.items || [],
                    })}
                  >
                    <Eye size={14} />
                    <span>Click Eye View to open {detailInvitation.items.length} item(s) in preview popup</span>
                  </div>
                </div>
              )}

              {/* Documents */}
              {detailInvitation.documentIds && detailInvitation.documentIds.length > 0 && (
                <div className="onb-detail-section">
                  <div className="onb-detail-items-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={14} />
                      <span className="onb-detail-items-header__title">
                        Required Documents ({detailInvitation.documentIds.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      className="onb-eye-view-btn"
                      onClick={() => setEyeViewModal({
                        type: 'documents',
                        companyName: detailInvitation.companyName,
                        docNames: detailDocNames,
                      })}
                      title="Open preview popup window"
                    >
                      <Eye size={13} />
                      <span>Eye View</span>
                    </button>
                  </div>

                  <div
                    className="onb-eye-view-placeholder"
                    onClick={() => setEyeViewModal({
                      type: 'documents',
                      companyName: detailInvitation.companyName,
                      docNames: detailDocNames,
                    })}
                  >
                    <Eye size={14} />
                    <span>Click Eye View to open {detailInvitation.documentIds.length} document(s) in preview popup</span>
                  </div>
                </div>
              )}

              {/* Notes */}
              {detailInvitation.notes && (
                <div className="onb-detail-section">
                  <div className="onb-detail-section__label">
                    Notes
                  </div>
                  <p className="onb-detail-notes-text">{detailInvitation.notes}</p>
                </div>
              )}

              {!detailInvitation.items?.length && (!detailInvitation.documentIds || detailInvitation.documentIds.length === 0) && !detailInvitation.notes && (
                <div className="onb-detail-empty">
                  <FileText size={36} />
                  <p>No items, documents, or notes were added to this invitation.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="onb-detail-footer">
              <button
                type="button"
                onClick={() => setDetailInvitation(null)}
                className="onb-detail-close-footer-btn"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

        <div className="onb-list-section">
          {/* Backdrop when sent invitations are expanded */}
          {isSentExpanded && (
            <div className="onb-form-card-backdrop" onClick={() => setIsSentExpanded(false)} />
          )}

          <div className={`onb-list-card ${isSentExpanded ? 'onb-list-card--expanded' : ''}`}>
            <div className="onb-list-card__header">
              <div className="onb-list-card__header-left">
                <List size={15} className="onb-list-card__header-icon" />
                <h2>Sent Invitations ({invitations.length})</h2>
              </div>
              <div className="onb-list-card__header-actions">
                <button
                  type="button"
                  className="onb-form-card__expand-btn onb-form-card__expand-btn--list"
                  onClick={() => setIsSentExpanded((expanded) => !expanded)}
                  title={isSentExpanded ? 'Restore' : 'Expand'}
                  aria-label={isSentExpanded ? 'Restore sent invitations' : 'Expand sent invitations'}
                >
                  {isSentExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button className="onb-list-card__queue-link" onClick={() => navigate('/onboarding/queue')}>
                  View Onboarding Queue <ArrowRight size={13} />
                </button>
              </div>
            </div>

            {isSentExpanded ? (
              <div className="onb-list-card__expanded-body">
                {sentInvitationsContent}
              </div>
            ) : (
              sentInvitationsContent
            )}
          </div>
        </div>
      </div>

      {/* ── Vendor Detail Modal (from suggestion click) ── */}
      {showVendorDetail && selectedSearchVendor && (
        <VendorDetailModal
          vendor={selectedSearchVendor}
          onClose={handleCloseVendorDetail}
          onContinueNew={handleContinueNewFromDetail}
          onViewVendor={handleViewExistingVendor}
        />
      )}

      {/* ── Duplicate Alert Modal ── */}
      {showDuplicateAlert && selectedSearchVendor && (
        <VendorDuplicateModal
          companyName={companyName}
          matchedVendor={{
            name: selectedSearchVendor.name,
            email: selectedSearchVendor.email,
            contactPerson: selectedSearchVendor.contactPerson,
          }}
          onViewExisting={handleViewExistingVendor}
          onCreateNew={handleDuplicateCreateAnyway}
          onCancel={handleDuplicateCancel}
        />
      )}

      {/* ── SAP Style Invitation Sent Success Modal ── */}
      {sentSuccessModal && (
        <div className="onb-modal-backdrop" onClick={() => setSentSuccessModal(null)}>
          <div className="onb-modal onb-modal--sap-success" onClick={(e) => e.stopPropagation()}>
            <div className="onb-modal__header onb-modal__header--blue">
              <div className="onb-modal__title">
                <CheckCircle2 size={20} />
                <span>Vendor Invitation Sent</span>
              </div>
              <button
                type="button"
                className="onb-modal__close-btn"
                onClick={() => setSentSuccessModal(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="onb-modal__body">
              <div className="onb-modal__success-banner">
                <CheckCircle2 size={24} className="onb-modal__success-icon" />
                <div>
                  <h4 className="onb-modal__success-title">Invitation Dispatched!</h4>
                  <p className="onb-modal__success-text">
                    An onboarding invitation email has been sent to <strong>{sentSuccessModal.contactEmail}</strong>.
                  </p>
                </div>
              </div>

              <div className="onb-modal__summary">
                <div className="onb-modal__summary-row">
                  <span className="onb-modal__summary-label">Company Name</span>
                  <span className="onb-modal__summary-value">{sentSuccessModal.companyName}</span>
                </div>
                <div className="onb-modal__summary-row">
                  <span className="onb-modal__summary-label">Invite Code</span>
                  <span className="onb-modal__summary-value onb-modal__summary-value--code">{sentSuccessModal.inviteCode}</span>
                </div>
                <div className="onb-modal__summary-row">
                  <span className="onb-modal__summary-label">Expires At</span>
                  <span className="onb-modal__summary-value">{sentSuccessModal.expiresAt}</span>
                </div>
                {sentSuccessModal.itemsCount > 0 && (
                  <div className="onb-modal__summary-row">
                    <span className="onb-modal__summary-label">Items Attached</span>
                    <span className="onb-modal__summary-value">{sentSuccessModal.itemsCount} item(s)</span>
                  </div>
                )}
                {sentSuccessModal.documentsCount > 0 && (
                  <div className="onb-modal__summary-row">
                    <span className="onb-modal__summary-label">Required Documents</span>
                    <span className="onb-modal__summary-value">{sentSuccessModal.documentsCount} doc(s)</span>
                  </div>
                )}
              </div>

              <div className="onb-modal__question-box">
                <p className="onb-modal__question-text">
                  Do you want to add another vendor?
                </p>
              </div>
            </div>

            <div className="onb-modal__footer">
              <button
                type="button"
                className="onb-modal__btn onb-modal__btn--secondary"
                onClick={() => {
                  setSentSuccessModal(null);
                  navigate('/onboarding/queue');
                }}
              >
                View Onboarding Queue
              </button>
              <button
                type="button"
                className="onb-modal__btn onb-modal__btn--primary"
                onClick={() => {
                  setSentSuccessModal(null);
                  setTimeout(() => companyNameRef.current?.focus(), 100);
                }}
              >
                <Plus size={15} /> Add Another Vendor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Eye View Popup Modal (Dedicated Preview Window) ── */}
      {eyeViewModal && (
        <div className="onb-detail-backdrop" style={{ zIndex: 11000 }} onClick={() => setEyeViewModal(null)}>
          <div className="onb-modal onb-modal--sap-success" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            {/* Header */}
            <div className="onb-modal__header onb-modal__header--blue">
              <div className="onb-modal__title">
                {eyeViewModal.type === 'items' ? <Package size={20} /> : <FileText size={20} />}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {eyeViewModal.type === 'items' ? 'Attached Required Items' : 'Configured Required Documents'}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>
                    {eyeViewModal.companyName}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="onb-modal__close-btn"
                onClick={() => setEyeViewModal(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="onb-modal__body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '20px 24px' }}>
              {eyeViewModal.type === 'items' && eyeViewModal.items && (
                <div className="onb-popup-table">
                  <div className="onb-popup-table__head" style={{ gridTemplateColumns: '120px 1fr' }}>
                    <span>Item Code</span>
                    <span>Item Name</span>
                  </div>
                  {eyeViewModal.items.map((it, idx) => (
                    <div key={idx} className="onb-popup-table__row" style={{ gridTemplateColumns: '120px 1fr', padding: '10px 12px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary-500)' }}>
                        {it.itemCode || '—'}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {it.itemName}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {eyeViewModal.type === 'documents' && eyeViewModal.docNames && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {eyeViewModal.docNames.map((name, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <FileText size={16} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="onb-modal__footer">
              <button
                type="button"
                className="onb-modal__btn onb-modal__btn--primary"
                style={{ marginLeft: 'auto' }}
                onClick={() => setEyeViewModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pre-Send Predictive Match Confidence Modal ── */}
      {showPreSendConfidenceModal && (
        <div className="onb-modal-backdrop" style={{ zIndex: 10500 }} onClick={() => setShowPreSendConfidenceModal(false)}>
          <div className="onb-modal onb-modal--sap-success" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            {/* Header */}
            <div className="onb-modal__header onb-modal__header--blue">
              <div className="onb-modal__title">
                <ShieldCheck size={20} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Predictive Match Confidence Audit</div>
                  <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Live Database Vendor Duplication Scan</div>
                </div>
              </div>
              <button
                type="button"
                className="onb-modal__close-btn"
                onClick={() => setShowPreSendConfidenceModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="onb-modal__body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {auditLoading ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div className="onb-search-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Scanning database for vendor duplication...</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Comparing company name, email, and contact credentials</div>
                </div>
              ) : (
                <>
                  {/* Score Badge Card */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderRadius: 'var(--radius-lg)',
                    background: auditResult?.matchedVendor
                      ? auditResult.duplicationRisk === 'HIGH'
                        ? 'rgba(239, 68, 68, 0.08)'
                        : 'rgba(245, 158, 11, 0.08)'
                      : 'linear-gradient(135deg, rgba(10, 110, 209, 0.12), rgba(99, 102, 241, 0.08))',
                    border: auditResult?.matchedVendor
                      ? auditResult.duplicationRisk === 'HIGH'
                        ? '1px solid rgba(239, 68, 68, 0.25)'
                        : '1px solid rgba(245, 158, 11, 0.25)'
                      : '1px solid rgba(10, 110, 209, 0.25)',
                  }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {auditResult?.matchedVendor ? 'Vendor Duplication Match' : 'Duplication Risk Rating'}
                      </div>
                      <div style={{
                        fontSize: 26,
                        fontWeight: 800,
                        color: auditResult?.matchedVendor
                          ? auditResult.duplicationRisk === 'HIGH'
                            ? '#ef4444'
                            : '#f59e0b'
                          : '#10b981',
                        marginTop: 2,
                      }}>
                        {auditResult?.score}%
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                        {auditResult?.matchedVendor
                          ? `Duplicate Vendor Record: ${auditResult.matchedVendor.name}`
                          : '0% Duplication Risk · Unique Vendor Entry'}
                      </div>
                    </div>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: auditResult?.matchedVendor ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: auditResult?.matchedVendor ? (auditResult.duplicationRisk === 'HIGH' ? '#ef4444' : '#f59e0b') : '#10b981',
                    }}>
                      {auditResult?.matchedVendor ? <AlertTriangle size={24} /> : <ShieldCheck size={26} />}
                    </div>
                  </div>

                  {/* Matched DB Vendor Warning (if any) */}
                  {auditResult?.matchedVendor && (
                    <div style={{
                      display: 'flex',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                    }}>
                      <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
                      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                        <strong>Database Duplication Warning:</strong> Vendor <strong>{auditResult.matchedVendor.name}</strong> ({auditResult.matchedVendor.email}) matches your input with a <strong>{auditResult.matchedVendor.score}% similarity score</strong>.
                      </div>
                    </div>
                  )}

                  {/* Audit Summary Details & Equal 25% Weightage Breakdown */}
                  <div className="onb-modal__summary">
                    <div className="onb-modal__summary-row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 4 }}>
                      <span className="onb-modal__summary-label" style={{ fontWeight: 700 }}>Weighted Duplication Risk:</span>
                      <span className="onb-modal__summary-value" style={{
                        fontWeight: 800,
                        color: auditResult?.duplicationRisk === 'HIGH' ? '#ef4444' : auditResult?.duplicationRisk === 'MEDIUM' ? '#f59e0b' : '#10b981'
                      }}>
                        {auditResult?.matchedVendor
                          ? `${auditResult.duplicationRisk} RISK (${auditResult.matchedVendor.score}% match in DB)`
                          : 'LOW RISK (0 Matches in Database)'}
                      </span>
                    </div>

                    {/* Equal Weightage 25% Breakdown Grid */}
                    {auditResult?.breakdown && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', padding: '4px 0 8px', borderBottom: '1px dashed var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Company Name (25%):</span>
                          <span style={{ fontWeight: 700, color: auditResult.breakdown.nameScore > 0 ? '#f59e0b' : '#10b981' }}>
                            {auditResult.breakdown.nameScore}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Vendor Email (25%):</span>
                          <span style={{ fontWeight: 700, color: auditResult.breakdown.emailScore > 0 ? '#f59e0b' : '#10b981' }}>
                            {auditResult.breakdown.emailScore}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Contact Person (25%):</span>
                          <span style={{ fontWeight: 700, color: auditResult.breakdown.personScore > 0 ? '#f59e0b' : '#10b981' }}>
                            {auditResult.breakdown.personScore}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Phone Number (25%):</span>
                          <span style={{ fontWeight: 700, color: auditResult.breakdown.phoneScore > 0 ? '#f59e0b' : '#10b981' }}>
                            {auditResult.breakdown.phoneScore}%
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="onb-modal__summary-row" style={{ paddingTop: 4 }}>
                      <span className="onb-modal__summary-label">Data Validation:</span>
                      <span className="onb-modal__summary-value" style={{ color: '#10b981' }}>
                        ✓ Email & Phone Format Verified
                      </span>
                    </div>
                    <div className="onb-modal__summary-row">
                      <span className="onb-modal__summary-label">Items Attached:</span>
                      <span className="onb-modal__summary-value">
                        {items.filter((it) => it.itemCode.trim() && it.itemName.trim()).length} item(s)
                      </span>
                    </div>
                    <div className="onb-modal__summary-row">
                      <span className="onb-modal__summary-label">Required Documents:</span>
                      <span className="onb-modal__summary-value">
                        {selectedDocIds.length} document(s)
                      </span>
                    </div>
                  </div>

                  {/* Vendor Briefing Box */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-elevated)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-placeholder)', textTransform: 'uppercase', marginBottom: 4 }}>
                      Target Vendor
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {companyName}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {contactEmail} {contactPerson ? `· ${contactPerson}` : ''} {contactPhone ? `· ${contactCountryCode}${contactPhone}` : ''}
                    </div>
                  </div>

                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>
                    Send the onboarding invitation email to <strong>{contactEmail}</strong>?
                  </p>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="onb-modal__footer">
              <button
                type="button"
                className="onb-modal__btn onb-modal__btn--secondary"
                onClick={() => setShowPreSendConfidenceModal(false)}
              >
                Back to Edit
              </button>
              <button
                type="button"
                className="onb-modal__btn onb-modal__btn--primary"
                onClick={executeSendInvite}
                disabled={sending || auditLoading}
              >
                {sending ? 'Sending...' : 'Confirm & Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
