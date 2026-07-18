import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { procurementService, type VendorInvitationRow, type VendorSearchResult } from '../../services/procurementService';
import { companySettingsService, type RequiredDocument } from '../../services/companySettingsService';
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
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import DesktopWindow from '../../components/shared/DesktopWindow';
import './NewOnboardingPage.css';

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

  // ── NDA/MNDA Required ──
  const [ndaMndaRequired, setNdaMndaRequired] = useState(false);

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

  // Debounced vendor search
  useEffect(() => {
    const q = companyName.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      setHasSearched(false);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await procurementService.searchVendors(q);
        setSearchResults(results);
        setShowSuggestions(true); // Always show dropdown (results or empty state)
        setHasSearched(true);
      } catch {
        setSearchResults([]);
        setShowSuggestions(true);
        setHasSearched(true);
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

  // Pre-populate selectedDocIds from the latest invitation's document IDs (persisted in DB)
  // so that the document selection carries over between invitations
  useEffect(() => {
    if (!invitations || invitations.length === 0) return;
    if (selectedDocIds.length > 0) return; // Don't override user's manual selection during auto-refresh
    const latestWithDocs = invitations.find(inv => inv.documentIds && inv.documentIds.length > 0);
    if (latestWithDocs && latestWithDocs.documentIds) {
      setSelectedDocIds(latestWithDocs.documentIds);
    }
  }, [invitations, selectedDocIds]);

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

  const pendingCount = useMemo(() => invitations.filter((i) => i.status === 'pending').length, [invitations]);
  const inQueueCount = useMemo(() => invitations.filter((i) => i.status === 'in_queue').length, [invitations]);

  useBodyScrollLock(isInviteExpanded);
  useBodyScrollLock(isSentExpanded);
  useBodyScrollLock(!!showVendorDetail);
  useBodyScrollLock(!!showDuplicateAlert);

  // Escape key closes expanded modals
  useEffect(() => {
    if (!isInviteExpanded && !isSentExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsInviteExpanded(false);
        setIsSentExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isInviteExpanded, isSentExpanded]);



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
    // User confirmed they want to create a new vendor despite the duplicate
    hasShownDuplicateRef.current = true; // Prevent showing again
  }, []);

  // When company name changes, reset the duplicate flag and check for high-confidence matches
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

  const handleSendInvite = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactEmail.trim()) return;
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
        notes: notes.trim() || undefined,
        items: validItems.length > 0 ? validItems : undefined,
        documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
        ndaMndaRequired,
      });
      setCompanyName('');
      setContactEmail('');
      setContactPerson('');
      setContactPhone('');
      setNotes('');
      setItems([]);
      setSelectedDocIds([]);
      setNdaMndaRequired(false);
      setSelectedSearchVendor(null);
      hasShownDuplicateRef.current = false;
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
      }
      setTimeout(() => setSentSuccess(''), 6000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  }, [companyName, contactEmail, contactPerson, contactPhone, contactCountryCode, notes, items, selectedDocIds, ndaMndaRequired, reload]);

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

            <form onSubmit={handleSendInvite} className="onb-form-card__body">
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
                      if (searchResults.length > 0 && companyName.trim().length >= 2) {
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
                  placeholder="Type your mobile number"
                />
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

              {/* NDA/MNDA Required Checkbox */}
              <div className="onb-items-bar">
                <div className="onb-items-bar__left">
                  <FileText size={15} />
                  <span className="onb-items-bar__label">NDA/MNDA Required</span>
                </div>
                <label className="onb-nda-toggle">
                  <input
                    type="checkbox"
                    checked={ndaMndaRequired}
                    onChange={(e) => setNdaMndaRequired(e.target.checked)}
                    className="onb-nda-checkbox"
                  />
                  <span className="onb-nda-toggle__label">
                    {ndaMndaRequired ? 'NDA/MNDA required for this vendor' : 'Not required'}
                  </span>
                </label>
              </div>

              {/* Documents — Compact Summary + Popup Trigger */}
              <div className="onb-items-bar">
                <div className="onb-items-bar__left">
                  <FileText size={15} />
                  <span className="onb-items-bar__label">Upload Documents</span>
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
            title="Select Upload Documents"
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
                      <label key={doc.id} className={`onb-doc-select__item ${selectedDocIds.includes(doc.id) ? 'onb-doc-select__item--selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedDocIds.includes(doc.id)}
                          onChange={() => toggleDocSelection(doc.id)}
                          className="onb-doc-select__checkbox"
                        />
                        <FileText size={15} className="onb-doc-select__icon" />
                        <span className="onb-doc-select__name">{doc.name}</span>
                      </label>
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
                      <label key={doc.id} className={`onb-doc-select__item ${selectedDocIds.includes(doc.id) ? 'onb-doc-select__item--selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedDocIds.includes(doc.id)}
                          onChange={() => toggleDocSelection(doc.id)}
                          className="onb-doc-select__checkbox"
                        />
                        <FileText size={15} className="onb-doc-select__icon" />
                        <span className="onb-doc-select__name">{doc.name}</span>
                      </label>
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
                      <label key={doc.id} className={`onb-doc-select__item ${selectedDocIds.includes(doc.id) ? 'onb-doc-select__item--selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedDocIds.includes(doc.id)}
                          onChange={() => toggleDocSelection(doc.id)}
                          className="onb-doc-select__checkbox"
                        />
                        <FileText size={15} className="onb-doc-select__icon" />
                        <span className="onb-doc-select__name">{doc.name}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </DesktopWindow>
        </div>

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
                  <div>
                    <div className="onb-detail-info-grid__label">Invite Code</div>
                    <div className="onb-detail-info-grid__value onb-detail-info-grid__value--mono">{detailInvitation.inviteCode}</div>
                  </div>
                </div>
              </div>

              {/* Items */}
              {detailInvitation.items && detailInvitation.items.length > 0 && (
                <div className="onb-detail-section">
                  <div className="onb-detail-items-header">
                    <Package size={14} />
                    <span className="onb-detail-items-header__title">
                      Items ({detailInvitation.items.length})
                    </span>
                  </div>
                  <div className="onb-detail-chips">
                    {detailInvitation.items.map((it, idx) => (
                      <span key={idx} className="onb-detail-chip">
                        <span className="onb-detail-chip__name">{it.itemName}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents */}
              {detailInvitation.selectedDocuments && detailInvitation.selectedDocuments.length > 0 && (
                <div className="onb-detail-section">
                  <div className="onb-detail-items-header">
                    <FileText size={14} />
                    <span className="onb-detail-items-header__title">
                      Documents ({detailInvitation.selectedDocuments.length})
                    </span>
                  </div>
                  <div className="onb-detail-chips">
                    {detailInvitation.selectedDocuments.map((doc, idx) => (
                      <span key={idx} className="onb-detail-chip">
                        <span className="onb-detail-chip__doc-name">{doc.name}</span>
                      </span>
                    ))}
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

              {!detailInvitation.items?.length && !detailInvitation.selectedDocuments?.length && !detailInvitation.notes && (
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

    </div>
  );
}
