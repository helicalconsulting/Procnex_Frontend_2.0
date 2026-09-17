import { useState, useCallback, useEffect, useRef, useMemo, createElement } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { companySettingsService, ALLOWED_CONTRACT_UPLOAD_EXTENSIONS, type Department, type Category, type Unit, type Position, type Warehouse, type Branch, type PaymentTerm, type CompanyProfile, type EmailTemplate, type RequiredDocument, type DocumentTemplate, type DocumentTemplateInput, type ContractTemplate, type ContractTemplateInput, type FormFieldConfig, type SequenceSetting } from '../../services/companySettingsService';
import { adminService } from '../../services/adminService';
import { invalidateApiCache } from '../../api/client';
import {
  Plus, X, Edit3, Building2, Tag, ChevronDown, ChevronRight, ChevronUp, Search,
  Save, Settings, DollarSign, Trash2, Ruler, Users, CreditCard, Mail, Phone, FileText, RotateCcw, Clock, Calendar,
  Palette, Image, FileSignature, Eye, Upload, Loader2, ArrowRight, Sparkles, AlertTriangle, CheckCircle2, Info, FileCheck, Globe, Hash,
  Lock, Unlock, ShieldCheck, Key, EyeOff, Check, MapPin, GitBranch,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import ImageCropperModal from '../../components/shared/ImageCropperModal';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { useBranding } from '../../context/BrandingContext';
import { CurrencySelector, useCurrency } from '../../components/shared/CurrencyMaster';
import RichTextEditor from '../../components/shared/RichTextEditor';
import '../../components/shared/RichTextEditor.css';
import './CompanySettingsPage.css';
import SignatureSection from '../../components/shared/SignatureSection';
import '../../components/shared/SignatureSection.css';
import OcrPreview from '../../components/shared/OcrPreview';
import '../../components/shared/OcrPreview.css';
import ErrorBoundary from '../../components/shared/ErrorBoundary';
import { TableSkeleton, CardSkeleton, PageSkeleton, Skeleton } from '../../components/shared/Skeleton';
import { useAuth } from '../../context/AuthContext';
import PhoneInput from '../../components/shared/PhoneInput';
import { COUNTRY_CODES } from '../../config/countryCodes';

// ─── Predictive Match Analysis ──────────────────────────────
interface PredictiveMatchResult {
  exact: boolean;
  item: string;
  reason?: string;
  matchScore: number;
}

// Built-in standard unit synonym & symbol equivalence groups
const UNIT_SYNONYM_GROUPS: string[][] = [
  ['kilogram', 'kilograms', 'kg', 'kgs', 'kilo', 'kilos'],
  ['gram', 'grams', 'g', 'gm', 'gms'],
  ['milligram', 'milligrams', 'mg', 'mgs'],
  ['metric ton', 'metric tonne', 'ton', 'tonne', 'tons', 'tonnes', 'tn', 't'],
  ['quintal', 'quintals', 'qtl', 'qtls'],
  ['pound', 'pounds', 'lb', 'lbs'],

  ['litre', 'litres', 'liter', 'liters', 'ltr', 'ltrs', 'l'],
  ['millilitre', 'millilitres', 'milliliter', 'milliliters', 'ml', 'mls'],
  ['gallon', 'gallons', 'gal', 'gals'],
  ['cubic metre', 'cubic meter', 'cbm', 'cu m', 'm3'],
  ['barrel', 'barrels', 'bbl', 'bbls'],

  ['metre', 'metres', 'meter', 'meters', 'mtr', 'mtrs', 'm'],
  ['centimetre', 'centimetres', 'centimeter', 'centimeters', 'cm', 'cms'],
  ['millimetre', 'millimetres', 'millimeter', 'millimeters', 'mm', 'mms'],
  ['feet', 'foot', 'ft', 'feets'],
  ['inch', 'inches', 'in'],
  ['yard', 'yards', 'yd', 'yds'],
  ['kilometre', 'kilometres', 'kilometer', 'kilometres', 'km', 'kms'],

  ['square metre', 'square meter', 'sq m', 'sqm', 'sq.m', 'm2'],
  ['square feet', 'square foot', 'sq ft', 'sqft', 'sq.ft', 'ft2'],
  ['square yard', 'square yards', 'sq yd', 'sqyd'],
  ['acre', 'acres'],
  ['hectare', 'hectares', 'ha'],

  ['piece', 'pieces', 'pc', 'pcs'],
  ['box', 'boxes', 'bx', 'bxs'],
  ['pack', 'packs', 'pk', 'pks', 'packet', 'packets', 'pkt', 'pkts'],
  ['set', 'sets'],
  ['pair', 'pairs', 'pr', 'prs'],
  ['roll', 'rolls', 'rl'],
  ['dozen', 'dozens', 'doz'],
  ['bundle', 'bundles', 'bdl', 'bdls'],
  ['carton', 'cartons', 'ctn', 'ctns'],
  ['bag', 'bags'],
  ['container', 'containers', 'ctr'],
  ['drum', 'drums'],

  ['hour', 'hours', 'hr', 'hrs'],
  ['day', 'days'],
  ['month', 'months', 'mth', 'mths'],
  ['year', 'years', 'yr', 'yrs'],
  ['shift', 'shifts'],
  ['man-day', 'manday', 'man day', 'man days', 'man-days'],
];

function findSynonymGroup(unitStr: string): string[] | null {
  const norm = unitStr.trim().toLowerCase();
  for (const group of UNIT_SYNONYM_GROUPS) {
    if (group.includes(norm)) {
      return group;
    }
  }
  return null;
}

function analyzePredictiveMatches(
  query: string,
  existingItems: Array<{ id?: number | string; name: string; abbreviation?: string; aliases?: string[] }>,
  excludeId?: number | string
): PredictiveMatchResult | null {
  const trimmed = query.trim();
  if (trimmed.length < 1) return null;

  const normQuery = trimmed.toLowerCase();

  // 1. Check exact match (name, abbreviation, or aliases)
  for (const item of existingItems) {
    if (!item.name) continue;
    if (excludeId !== undefined && String(item.id) === String(excludeId)) continue;
    const normName = item.name.trim().toLowerCase();

    if (normName === normQuery) {
      return { exact: true, item: item.name, matchScore: 100 };
    }
    // Check abbreviation as exact match (e.g. "kg" matches "kilogram")
    if (item.abbreviation && item.abbreviation.trim().toLowerCase() === normQuery) {
      return { exact: true, item: item.name, reason: `"${normQuery}" is the abbreviation of "${item.name}"`, matchScore: 100 };
    }
    if (item.aliases && item.aliases.some((a) => a.trim().toLowerCase() === normQuery)) {
      return { exact: true, item: item.name, reason: `Matches alias of "${item.name}"`, matchScore: 100 };
    }
  }

  // 2. Check Built-in Synonym & Symbol mapping (e.g. "kg" <-> "Kilogram")
  const queryGroup = findSynonymGroup(normQuery);
  if (queryGroup) {
    for (const item of existingItems) {
      if (!item.name) continue;
      if (excludeId !== undefined && String(item.id) === String(excludeId)) continue;
      const normName = item.name.trim().toLowerCase();

      if (queryGroup.includes(normName)) {
        return {
          exact: true,
          item: item.name,
          reason: `"${trimmed}" is the standard symbol/equivalent for existing unit "${item.name}"`,
          matchScore: 100,
        };
      }
      if (item.abbreviation && queryGroup.includes(item.abbreviation.trim().toLowerCase())) {
        return {
          exact: true,
          item: item.name,
          reason: `"${trimmed}" matches symbol for existing unit "${item.name}"`,
          matchScore: 100,
        };
      }
    }
  }

  // 3. Check high similarity match (substring/contains/words)
  for (const item of existingItems) {
    if (!item.name) continue;
    if (excludeId !== undefined && String(item.id) === String(excludeId)) continue;
    const normName = item.name.trim().toLowerCase();

    if (normName.includes(normQuery) || normQuery.includes(normName)) {
      const score = Math.round((Math.min(normQuery.length, normName.length) / Math.max(normQuery.length, normName.length)) * 100);
      return { exact: false, item: item.name, matchScore: Math.max(70, score) };
    }

    if (item.abbreviation) {
      const normAbbr = item.abbreviation.trim().toLowerCase();
      if (normAbbr.includes(normQuery) || normQuery.includes(normAbbr)) {
        return { exact: false, item: item.name, reason: `Similar to abbreviation "${item.abbreviation}" of "${item.name}"`, matchScore: 80 };
      }
    }

    if (item.aliases) {
      for (const a of item.aliases) {
        const normAlias = a.trim().toLowerCase();
        if (normAlias.includes(normQuery) || normQuery.includes(normAlias)) {
          return { exact: false, item: item.name, reason: `Similar to alias "${a}" of "${item.name}"`, matchScore: 75 };
        }
      }
    }
  }

  return null;
}

function PredictiveMatchCard({
  query,
  items,
  excludeId,
  labelName = 'item',
}: {
  query: string;
  items: Array<{ id?: number | string; name: string; abbreviation?: string; aliases?: string[] }>;
  excludeId?: number | string;
  labelName?: string;
}) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  const result = analyzePredictiveMatches(query, items, excludeId);

  if (!result) {
    return (
      <div className="cs-predictive-card cs-predictive-card--unique">
        <CheckCircle2 size={13} className="cs-predictive-icon" />
        <span>Predictive Analysis: Name is unique &amp; available</span>
      </div>
    );
  }

  if (result.exact) {
    return (
      <div className="cs-predictive-card cs-predictive-card--exact">
        <AlertTriangle size={13} className="cs-predictive-icon" />
        <span>
          <strong>Predictive Match (100%):</strong> {labelName} <strong>"{result.item}"</strong> already exists. {result.reason || ''}
        </span>
      </div>
    );
  }

  return (
    <div className="cs-predictive-card cs-predictive-card--similar">
      <Sparkles size={13} className="cs-predictive-icon" />
      <span>
        <strong>Predictive Analysis ({result.matchScore}% Match):</strong> Similar {labelName.toLowerCase()} found: <strong>"{result.item}"</strong>. {result.reason || 'Please verify to avoid duplicates.'}
      </span>
    </div>
  );
}

// ─── Utility: Convert structured plain text to HTML ─────────
// Converts extracted OCR plain text into rich, beautifully formatted HTML
// matching enterprise SRM software standards (headings, bold clause titles,
// bulleted/numbered lists, key-value pairs, metadata headers, paragraph blocks).
function textToHtml(text: string): string {
  if (!text || !text.trim()) return '';

  const rawLines = text.split(/\r?\n/);
  const htmlBlocks: string[] = [];
  let currentListItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (currentListItems.length > 0) {
      const tag = listType === 'ol' ? 'ol' : 'ul';
      const itemsHtml = currentListItems
        .map((item) => `<li style="margin-bottom: 4px; line-height: 1.5;">${item}</li>`)
        .join('');
      htmlBlocks.push(`<${tag} style="margin-top: 4px; margin-bottom: 12px; padding-left: 24px;">${itemsHtml}</${tag}>`);
      currentListItems = [];
      listType = null;
    }
  };

  let isFirstContentLine = true;
  let isSecondContentLine = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flushList();
      htmlBlocks.push('<p><br></p>');
      continue;
    }

    // Split lines containing bullet symbols like • or ● embedded in sentence text
    let subLines: string[] = [line];
    if ((line.includes('•') || line.includes('●') || line.includes('▪')) && !/^[•●▪]/.test(trimmed)) {
      const parts = line.split(/(?=[•●▪])/);
      if (parts.length > 1) {
        subLines = parts;
      }
    }

    for (let j = 0; j < subLines.length; j++) {
      const subLine = subLines[j];
      const subTrimmed = subLine.trim();
      if (!subTrimmed) continue;

      // Escape HTML entities to prevent invalid injection while preserving placeholders like {{companyName}}
      let escaped = subTrimmed
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Preserve indentation if present
      const leadingSpaces = subLine.match(/^ +/);
      const spaceCount = leadingSpaces ? leadingSpaces[0].length : 0;
      const indentPrefix = spaceCount >= 4 ? '&nbsp;&nbsp;&nbsp;&nbsp;' : spaceCount >= 2 ? '&nbsp;&nbsp;' : '';

      // Rule 1: Horizontal Dividers / Separators (e.g. "---", "===", "___")
      if (/^[-=_*]{3,}$/.test(subTrimmed)) {
        flushList();
        htmlBlocks.push('<hr style="border: none; border-top: 1px solid #cbd5e1; margin: 16px 0;" />');
        continue;
      }

      // Rule 2: Bullet points or Numbered lists
      const bulletMatch = escaped.match(/^(?:[•●▪\-\*\+]\s*|\(?\d+[\.\)]\s+|\(?[a-zA-Z][\.\)]\s+)(.*)/);
      const isHeaderClause = /^(?:SECTION|ARTICLE|CLAUSE|\d+[\.\)]\s+[A-Z0-9\s,&-]{4,})/i.test(subTrimmed);

      if (bulletMatch && !isHeaderClause) {
        const listContent = bulletMatch[1].trim();
        const isNumeric = /^\(?\d+[\.\)]/.test(escaped);
        const targetListType = isNumeric ? 'ol' : 'ul';

        if (listType && listType !== targetListType) {
          flushList();
        }
        listType = targetListType;
        currentListItems.push(indentPrefix + listContent);
        continue;
      }

      // Encountered non-list content → flush active list
      flushList();

      // Rule 3: Main Document Title (First non-empty line)
      if (isFirstContentLine) {
        isFirstContentLine = false;
        isSecondContentLine = true;
        if (subTrimmed.length <= 80 && !subTrimmed.endsWith('.')) {
          htmlBlocks.push(
            `<h2 style="margin-top: 4px; margin-bottom: 6px; font-size: 1.45em; font-weight: 700; color: #0f172a; line-height: 1.3;">${escaped}</h2>`
          );
          continue;
        }
      } else if (isSecondContentLine) {
        isSecondContentLine = false;
        if (subTrimmed.length <= 80 && !subTrimmed.endsWith('.') && !/^(SECTION|ARTICLE|DEFINITIONS|\d+[\.\)])/i.test(subTrimmed)) {
          htmlBlocks.push(
            `<p style="margin-top: 0; margin-bottom: 12px; font-size: 1.05em; font-weight: 600; color: #475569;">${escaped}</p>`
          );
          continue;
        }
      }

      // Rule 4: Contact / Link / Metadata bar (e.g. "email@domain.com | +91-123456 | Linkedin")
      if (subTrimmed.includes('|') && (subTrimmed.includes('@') || subTrimmed.includes('+') || /linkedin|github|leetcode|website|phone|email/i.test(subTrimmed))) {
        const parts = escaped.split('|').map(p => p.trim());
        const formattedPipe = parts.join(' &nbsp;<span style="color:#cbd5e1;">|</span>&nbsp; ');
        htmlBlocks.push(
          `<p style="margin-top: 2px; margin-bottom: 14px; color: #64748b; font-size: 0.9em; font-weight: 500;">${formattedPipe}</p>`
        );
        continue;
      }

      // Rule 5: Section Headings & Clause Titles
      const isAllCapsHeading = /^[A-Z0-9\s,&/\\'\(\)-]{3,60}$/.test(subTrimmed) && !/[a-z]/.test(subTrimmed) && subTrimmed.length > 2;
      const isNumberedClauseHeading = /^(?:\d+[\.\)]\s+|ARTICLE\s+[IVXLCDM\d]+|SECTION\s+\d+|CLAUSE\s+\d+)\s+[A-Z0-9\s,&/\\'-]+/i.test(subTrimmed) && subTrimmed.length <= 90;
      const isColonTitle = subTrimmed.endsWith(':') && subTrimmed.length <= 60 && !subTrimmed.includes('http');

      if (isAllCapsHeading || isNumberedClauseHeading || isColonTitle) {
        htmlBlocks.push(
          `<h3 style="margin-top: 18px; margin-bottom: 8px; font-size: 1.15em; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">${escaped}</h3>`
        );
        continue;
      }

      // Rule 6: Sub-clause numbering (e.g. "1.1 Confidential Information", "Section 2.3")
      const subClauseMatch = escaped.match(/^(\d+\.\d+(?:\.\d+)?|\b[A-Z]\.\d+)\s+(.*)/);
      if (subClauseMatch) {
        const clauseNum = subClauseMatch[1];
        const clauseRest = subClauseMatch[2];
        htmlBlocks.push(
          `<p style="margin-bottom: 8px; line-height: 1.55;"><strong>${clauseNum}</strong> ${clauseRest}</p>`
        );
        continue;
      }

      // Rule 7: Key-Value Pairs (e.g. "EFFECTIVE DATE: September 10, 2026", "Vendor Name: {{vendorName}}")
      const keyValueMatch = escaped.match(/^([A-Za-z0-9_\s\{\}]+:)\s*(.*)/);
      if (keyValueMatch && keyValueMatch[1].length <= 40 && !keyValueMatch[1].toLowerCase().startsWith('http')) {
        const keyLabel = keyValueMatch[1];
        const valueText = keyValueMatch[2];
        htmlBlocks.push(
          `<p style="margin-bottom: 6px; line-height: 1.5;"><strong style="color: #334155;">${keyLabel}</strong> ${valueText}</p>`
        );
        continue;
      }

      // Rule 8: Normal Paragraphs
      htmlBlocks.push(`<p style="margin-bottom: 8px; line-height: 1.6; color: #1e293b;">${indentPrefix}${escaped}</p>`);
    }
  }

  flushList();

  return htmlBlocks.join('\n');
}

// ─── Resolve dynamic placeholders ({YYYY} {YY} {MM} {DD}) ──────────────
function resolvePlaceholders(template: string): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  return template
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yyyy.slice(-2))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/\{DD\}/g, String(now.getDate()).padStart(2, '0'));
}

// ─── Tab Definitions ────────────────────────────────────────

type TabKey = 'general' | 'branding' | 'departments' | 'branches' | 'warehouses' | 'forms' | 'form-documents' | 'email-templates' | 'documents-contracts' | 'doc-serialization';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { key: 'general',             label: 'General',                icon: <Settings size={15} /> },
  { key: 'branding',            label: 'Branding',               icon: <Palette size={15} /> },
  { key: 'departments',         label: 'Departments',            icon: <Building2 size={15} /> },
  { key: 'branches',            label: 'Branches',               icon: <MapPin size={15} /> },
  { key: 'warehouses',          label: 'Warehouses',             icon: <Building2 size={15} /> },
  { key: 'forms',               label: 'Forms Settings',         icon: <FileText size={15} /> },
  { key: 'form-documents',      label: 'Required Documents',     icon: <FileCheck size={15} /> },
  { key: 'email-templates',     label: 'Email Templates',        icon: <Mail size={15} /> },
  { key: 'documents-contracts', label: 'Documents & Contracts',  icon: <FileSignature size={15} /> },
  { key: 'doc-serialization',   label: 'Document Serialization', icon: <Hash size={15} /> },
];

// ─── Email Template Labels & Placeholders ───────────────────

const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  vendor_onboarding_invitation: 'Supplier Onboarding Invitation',
  vendor_approval_credentials: 'Vendor Portal Credentials',
  vendor_password_setup: 'Vendor Password Setup',
  vendor_rejection_resubmit: 'Onboarding Revision Required',
  rfq_invitation: 'RFQ Invitation (Existing Vendor)',
  new_vendor_rfq_invitation: 'RFQ Invitation (New Vendor)',
  quotation_approval: 'Quotation Approval Request',
  quotation_submitted: 'Quotation Submitted Notification',
  vendor_winning: 'Vendor Winning Notification',
  vendor_not_selected: 'Vendor Not Selected',
  vendor_quotation_returned: 'Quotation Returned to Vendor',
  quotation_returned_review: 'Quotation Returned for Re-review',
  po_to_vendor: 'Purchase Order to Vendor',
  po_info_copy: 'PO Info Copy (CC Vendors)',
};

const EMAIL_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATE_LABELS);

const EMAIL_PLACEHOLDERS: Record<string, string> = {
  '{{recipient}}': 'Recipient name (contact person or vendor name)',
  '{{vendorName}}': 'Vendor company name',
  '{{company}}': 'Your company name',
  '{{rfqNumber}}': 'RFQ number',
  '{{rfqTitle}}': 'RFQ title',
  '{{poNumber}}': 'Purchase Order number',
  '{{winningVendorName}}': 'Name of the winning vendor',
  '{{returnedByLevel}}': 'Approval level number',
  '{{invitationExpiryDays}}': 'Number of days until the onboarding invitation expires (set in Company Settings > Time Limits)',
  '{{resubmissionDeadlineDays}}': 'Number of days the vendor has to resubmit after rejection (set in Company Settings > Time Limits)',
};

// ─── Standard Embedded Units Preset List ─────────────────────

interface EmbeddedUnit {
  name: string;
  category: string;
}

const EMBEDDED_STANDARD_UNITS: EmbeddedUnit[] = [
  // Weight & Mass
  { name: 'Kilogram', category: 'Weight & Mass' },
  { name: 'Gram', category: 'Weight & Mass' },
  { name: 'Milligram', category: 'Weight & Mass' },
  { name: 'Metric Ton', category: 'Weight & Mass' },
  { name: 'Quintal', category: 'Weight & Mass' },
  { name: 'Pound', category: 'Weight & Mass' },

  // Volume & Liquids
  { name: 'Litre', category: 'Volume & Liquids' },
  { name: 'Millilitre', category: 'Volume & Liquids' },
  { name: 'Gallon', category: 'Volume & Liquids' },
  { name: 'Cubic Metre', category: 'Volume & Liquids' },
  { name: 'Barrel', category: 'Volume & Liquids' },

  // Length & Distance
  { name: 'Metre', category: 'Length & Distance' },
  { name: 'Centimetre', category: 'Length & Distance' },
  { name: 'Millimetre', category: 'Length & Distance' },
  { name: 'Feet', category: 'Length & Distance' },
  { name: 'Inch', category: 'Length & Distance' },
  { name: 'Yard', category: 'Length & Distance' },
  { name: 'Kilometre', category: 'Length & Distance' },

  // Area
  { name: 'Square Metre', category: 'Area' },
  { name: 'Square Feet', category: 'Area' },
  { name: 'Square Yard', category: 'Area' },
  { name: 'Acre', category: 'Area' },
  { name: 'Hectare', category: 'Area' },

  // Quantity & Count
  { name: 'Piece', category: 'Quantity & Count' },
  { name: 'Box', category: 'Quantity & Count' },
  { name: 'Pack', category: 'Quantity & Count' },
  { name: 'Packet', category: 'Quantity & Count' },
  { name: 'Set', category: 'Quantity & Count' },
  { name: 'Pair', category: 'Quantity & Count' },
  { name: 'Roll', category: 'Quantity & Count' },
  { name: 'Dozen', category: 'Quantity & Count' },
  { name: 'Bundle', category: 'Quantity & Count' },
  { name: 'Carton', category: 'Quantity & Count' },
  { name: 'Bag', category: 'Quantity & Count' },
  { name: 'Container', category: 'Quantity & Count' },
  { name: 'Drum', category: 'Quantity & Count' },

  // Time & Service
  { name: 'Hour', category: 'Time & Service' },
  { name: 'Day', category: 'Time & Service' },
  { name: 'Month', category: 'Time & Service' },
  { name: 'Year', category: 'Time & Service' },
  { name: 'Shift', category: 'Time & Service' },
  { name: 'Man-day', category: 'Time & Service' },
];

// ─── Component ──────────────────────────────────────────────

export default function CompanySettingsPage() {
  const { hasPermission } = useAuth();
  const canCreateSettings = hasPermission('Company Settings', 'canCreate') || hasPermission('Settings', 'canCreate');
  const noPermissionTitle = "Admin has not allowed this action. You do not have permission to modify company settings.";
  const disabledActionStyle = !canCreateSettings ? { opacity: 0.6, cursor: 'not-allowed', pointerEvents: 'auto' as const } : undefined;

  // Passcode & Access control check
  const [isPasscodeProtected, setIsPasscodeProtected] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem('heliflow_cs_unlocked') === 'true';
  });
  const [checkingPasscodeStatus, setCheckingPasscodeStatus] = useState<boolean>(true);

  const isDataFetchEnabled = isUnlocked || (!checkingPasscodeStatus && !isPasscodeProtected);

  // Data
  const { data: departments, loading, reload } = useServiceData(
    () => companySettingsService.listDepartments(),
    [] as Department[],
    [],
    { cacheTtlMs: 60000, enabled: isDataFetchEnabled }
  );

  const { data: categories, reload: reloadCategories } = useServiceData(
    () => companySettingsService.listCategories(),
    [] as Category[],
    [],
    { cacheTtlMs: 60000, enabled: isDataFetchEnabled }
  );

  const { data: units, reload: reloadUnits } = useServiceData(
    () => companySettingsService.listUnits(),
    [] as Unit[],
    [],
    { cacheTtlMs: 60000, enabled: isDataFetchEnabled }
  );

  const { data: positions, reload: reloadPositions } = useServiceData(
    () => companySettingsService.listPositions(),
    [] as Position[],
    [],
    { cacheTtlMs: 60000, enabled: isDataFetchEnabled }
  );

  const { data: paymentTerms, reload: reloadPaymentTerms } = useServiceData(
    () => companySettingsService.listPaymentTerms(),
    [] as PaymentTerm[],
    [],
    { cacheTtlMs: 60000, enabled: isDataFetchEnabled }
  );

  const { data: requiredDocuments, loading: requiredDocsLoading, reload: reloadRequiredDocuments } = useServiceData(
    () => companySettingsService.listRequiredDocuments(),
    [] as RequiredDocument[],
    [],
    { cacheTtlMs: 30000, enabled: isDataFetchEnabled }
  );

  // ── Warehouses State ──
  const { data: warehouses, loading: warehousesLoading, reload: reloadWarehouses } = useServiceData(
    () => companySettingsService.listWarehouses(true),
    [] as Warehouse[],
    [],
    { cacheTtlMs: 30000, enabled: isDataFetchEnabled }
  );

  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [warehouseTypeFilter, setWarehouseTypeFilter] = useState('ALL');
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  const [whCode, setWhCode] = useState('');
  const [whName, setWhName] = useState('');
  const [whType, setWhType] = useState('Central Warehouse');
  const [whAddress, setWhAddress] = useState('');
  const [whCity, setWhCity] = useState('');
  const [whCountry, setWhCountry] = useState('');
  const [whContactPerson, setWhContactPerson] = useState('');
  const [whCountryCode, setWhCountryCode] = useState('+91');
  const [whPhone, setWhPhone] = useState('');
  const [whEmail, setWhEmail] = useState('');
  const [whIsDefault, setWhIsDefault] = useState(false);
  const [whIsActive, setWhIsActive] = useState(true);

  const filteredWarehouses = useMemo(() => {
    return warehouses.filter((wh) => {
      const matchType = warehouseTypeFilter === 'ALL' || wh.type === warehouseTypeFilter;
      if (!matchType) return false;

      if (!warehouseSearch.trim()) return true;
      const q = warehouseSearch.toLowerCase().trim();
      return (
        wh.code.toLowerCase().includes(q) ||
        wh.name.toLowerCase().includes(q) ||
        wh.type.toLowerCase().includes(q) ||
        (wh.city && wh.city.toLowerCase().includes(q)) ||
        (wh.address && wh.address.toLowerCase().includes(q)) ||
        (wh.contactPerson && wh.contactPerson.toLowerCase().includes(q))
      );
    });
  }, [warehouses, warehouseTypeFilter, warehouseSearch]);

  const openWarehouseModal = useCallback((wh: Warehouse | null) => {
    if (wh) {
      setEditingWarehouse(wh);
      setWhCode(wh.code);
      setWhName(wh.name);
      setWhType(wh.type || 'Central Warehouse');
      setWhAddress(wh.address || '');
      setWhCity(wh.city || '');
      setWhCountry(wh.country || '');
      setWhContactPerson(wh.contactPerson || '');

      let dial = '+91';
      let phoneDigits = wh.phone || '';
      if (phoneDigits.startsWith('+')) {
        const found = COUNTRY_CODES.find((c) => phoneDigits.startsWith(c.dial));
        if (found) {
          dial = found.dial;
          phoneDigits = phoneDigits.slice(found.dial.length).trim();
        }
      }
      setWhCountryCode(dial);
      setWhPhone(phoneDigits);
      setWhEmail(wh.email || '');
      setWhIsDefault(wh.isDefault || false);
      setWhIsActive(wh.isActive ?? true);
    } else {
      setEditingWarehouse(null);
      setWhCode(`WH-00${warehouses.length + 1}`);
      setWhName('');
      setWhType('Central Warehouse');
      setWhAddress('');
      setWhCity('');
      setWhCountry('');
      setWhContactPerson('');
      setWhCountryCode('+91');
      setWhPhone('');
      setWhEmail('');
      setWhIsDefault(warehouses.length === 0);
      setWhIsActive(true);
    }
    setShowWarehouseModal(true);
  }, [warehouses.length]);

  const handleSaveWarehouse = useCallback(async () => {
    if (!canCreateSettings) return;
    if (!whCode.trim() || !whName.trim()) {
      setPageMsg('Warehouse Code and Name are required.');
      return;
    }
    setActionLoading(true);
    try {
      const formattedPhone = whPhone.trim() ? `${whCountryCode} ${whPhone.trim()}` : undefined;
      const payload: Partial<Warehouse> = {
        code: whCode.trim().toUpperCase(),
        name: whName.trim(),
        type: whType,
        address: whAddress.trim() || undefined,
        city: whCity.trim() || undefined,
        country: whCountry.trim() || undefined,
        contactPerson: whContactPerson.trim() || undefined,
        phone: formattedPhone,
        email: whEmail.trim() || undefined,
        isDefault: whIsDefault,
        isActive: whIsActive,
      };

      if (editingWarehouse) {
        await companySettingsService.updateWarehouse(editingWarehouse.id, payload);
        setPageMsg(`Warehouse ${payload.code} updated successfully.`);
      } else {
        await companySettingsService.createWarehouse(payload);
        setPageMsg(`Warehouse ${payload.code} created successfully.`);
      }
      setShowWarehouseModal(false);
      reloadWarehouses();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save warehouse');
    } finally {
      setActionLoading(false);
    }
  }, [canCreateSettings, whCode, whName, whType, whAddress, whCity, whCountry, whContactPerson, whPhone, whEmail, whIsDefault, whIsActive, editingWarehouse, reloadWarehouses]);

  const handleSetDefaultWarehouse = useCallback(async (id: string) => {
    if (!canCreateSettings) return;
    try {
      await companySettingsService.setDefaultWarehouse(id);
      setPageMsg('Default Ship-To Warehouse updated.');
      reloadWarehouses();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to set default warehouse');
    }
  }, [canCreateSettings, reloadWarehouses]);

  // ── Branches State ──
  const { data: branches, loading: branchesLoading, reload: reloadBranches } = useServiceData(
    () => companySettingsService.listBranches(true),
    [] as Branch[],
    [],
    { cacheTtlMs: 30000, enabled: isDataFetchEnabled }
  );

  const { data: userList } = useServiceData(
    () => adminService.listUsers(),
    [],
    [],
    { cacheTtlMs: 60000, enabled: isDataFetchEnabled }
  );

  const [branchSearch, setBranchSearch] = useState('');
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const [bCode, setBCode] = useState('');
  const [bName, setBName] = useState('');
  const [bCity, setBCity] = useState('');
  const [bAddress, setBAddress] = useState('');
  const [bManagerId, setBManagerId] = useState('');
  const [bIsDefault, setBIsDefault] = useState(false);
  const [bIsActive, setBIsActive] = useState(true);

  const filteredBranches = useMemo(() => {
    return branches.filter((br) => {
      if (!branchSearch.trim()) return true;
      const q = branchSearch.toLowerCase().trim();
      return (
        br.code.toLowerCase().includes(q) ||
        br.name.toLowerCase().includes(q) ||
        (br.city && br.city.toLowerCase().includes(q)) ||
        (br.address && br.address.toLowerCase().includes(q)) ||
        (br.managerName && br.managerName.toLowerCase().includes(q))
      );
    });
  }, [branches, branchSearch]);

  const openBranchModal = useCallback((br: Branch | null) => {
    if (br) {
      setEditingBranch(br);
      setBCode(br.code);
      setBName(br.name);
      setBCity(br.city || '');
      setBAddress(br.address || '');
      setBManagerId(br.managerId || '');
      setBIsDefault(br.isDefault || false);
      setBIsActive(br.isActive ?? true);
    } else {
      setEditingBranch(null);
      setBCode(`BR-00${branches.length + 1}`);
      setBName('');
      setBCity('');
      setBAddress('');
      setBManagerId('');
      setBIsDefault(branches.length === 0);
      setBIsActive(true);
    }
    setShowBranchModal(true);
  }, [branches.length]);

  const handleSaveBranch = useCallback(async () => {
    if (!canCreateSettings) return;
    if (!bCode.trim() || !bName.trim()) {
      setPageMsg('Branch Code and Name are required.');
      return;
    }
    setActionLoading(true);
    try {
      const mgr = userList.find((u) => u.id === bManagerId);
      const payload: Partial<Branch> = {
        code: bCode.trim().toUpperCase(),
        name: bName.trim(),
        city: bCity.trim() || undefined,
        address: bAddress.trim() || undefined,
        managerId: bManagerId || undefined,
        managerName: mgr ? mgr.fullName : undefined,
        isDefault: bIsDefault,
        isActive: bIsActive,
      };

      if (editingBranch) {
        await companySettingsService.updateBranch(editingBranch.id, payload);
        setPageMsg(`Branch ${payload.code} updated successfully.`);
      } else {
        await companySettingsService.createBranch(payload);
        setPageMsg(`Branch ${payload.code} created successfully.`);
      }
      setShowBranchModal(false);
      reloadBranches();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save branch');
    } finally {
      setActionLoading(false);
    }
  }, [canCreateSettings, bCode, bName, bCity, bAddress, bManagerId, bIsDefault, bIsActive, userList, editingBranch, reloadBranches]);

  const handleSetDefaultBranch = useCallback(async (id: string) => {
    if (!canCreateSettings) return;
    try {
      await companySettingsService.setDefaultBranch(id);
      setPageMsg('Default Company Branch updated.');
      reloadBranches();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to set default branch');
    }
  }, [canCreateSettings, reloadBranches]);

  const handleDeleteBranch = useCallback(async (id: string) => {
    if (!canCreateSettings) return;
    if (!window.confirm('Are you sure you want to delete this branch? Users assigned to this branch will be unlinked.')) return;
    try {
      await companySettingsService.deleteBranch(id);
      setPageMsg('Branch deleted successfully.');
      reloadBranches();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to delete branch');
    }
  }, [canCreateSettings, reloadBranches]);

  // UI state
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [docContractSubTab, setDocContractSubTab] = useState<'contracts' | 'doc-templates'>('contracts');

  // ── Document Serialization Sequences ──
  const [sequences, setSequences] = useState<SequenceSetting[]>([]);
  const [seqLoading, setSeqLoading] = useState(false);
  const [seqSaving, setSeqSaving] = useState<string | null>(null);
  const [seqErrMsg, setSeqErrMsg] = useState<string | null>(null);
  const [seqSuccessInfo, setSeqSuccessInfo] = useState<{ label: string; preview: string } | null>(null);
  const [seqEdits, setSeqEdits] = useState<Record<string, Partial<SequenceSetting>>>({});

  const fetchSequences = useCallback(async () => {
    setSeqLoading(true);
    try {
      const list = await companySettingsService.listSequenceSettings();
      setSequences(list);
      // Initialize edits from fetched data
      const edits: Record<string, Partial<SequenceSetting>> = {};
      list.forEach((s) => { edits[s.entityType] = { ...s }; });
      setSeqEdits(edits);
    } catch {
      // ignore
    } finally {
      setSeqLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'doc-serialization') fetchSequences();
  }, [activeTab, fetchSequences]);

  const handleSeqFieldChange = useCallback((entityType: string, field: keyof SequenceSetting, value: string | number) => {
    if (!canCreateSettings) return;
    setSeqEdits((prev) => ({
      ...prev,
      [entityType]: { ...prev[entityType], [field]: value },
    }));
  }, [canCreateSettings]);

  const handleSeqSave = useCallback(async (entityType: string) => {
    if (!canCreateSettings) return;
    const edit = seqEdits[entityType];
    if (!edit) return;
    setSeqSaving(entityType);
    setSeqErrMsg(null);
    setSeqSuccessInfo(null);
    try {
      const updated = await companySettingsService.updateSequenceSetting({
        entityType,
        prefix: String(edit.prefix ?? ''),
        suffix: String(edit.suffix ?? ''),
        nextNumber: Number(edit.nextNumber ?? 1),
        paddingLength: Number(edit.paddingLength ?? 4),
        resetFrequency: String(edit.resetFrequency ?? 'NEVER'),
        periodStartDate: edit.periodStartDate ? String(edit.periodStartDate) : null,
        periodEndDate: edit.periodEndDate ? String(edit.periodEndDate) : null,
      });
      setSequences((prev) => prev.map((s) => s.entityType === entityType ? { ...s, ...updated } : s));
      const meta = {
        SUPPLIER_CODE: 'Supplier Code',
        PURCHASE_ORDER: 'Purchase Order No.',
        RFQ: 'RFQ Number',
        INVOICE: 'Invoice Number',
        CONTRACT: 'Contract Number',
        PAYMENT_VOUCHER: 'Payment Voucher No.',
      } as Record<string, string>;
      const prefix = resolvePlaceholders(String(edit.prefix ?? ''));
      const suffix = resolvePlaceholders(String(edit.suffix ?? ''));
      const num = Number(edit.nextNumber ?? 1);
      const pad = Number(edit.paddingLength ?? 4);
      const preview = `${prefix}${String(num).padStart(pad, '0')}${suffix ? '-' + suffix : ''}`;
      setSeqSuccessInfo({ label: meta[entityType] ?? entityType, preview });

    } catch (err) {
      setSeqErrMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSeqSaving(null);
    }
  }, [seqEdits, canCreateSettings]);

  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ updated: number; nextCounter: number } | null>(null);
  const [showBackfillSuccess, setShowBackfillSuccess] = useState(false);

  const runBackfill = useCallback(async () => {
    if (!canCreateSettings) return;
    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      const result = await companySettingsService.backfillSupplierCodes();
      setBackfillResult(result);
      setShowBackfillSuccess(true);
      // Reload sequences so counter reflects the new value
      const settings = await companySettingsService.listSequenceSettings();
      if (settings?.settings) {
        setSequences(settings.settings);
        const edits: Record<string, any> = {};
        for (const s of settings.settings) edits[s.entityType] = { ...s };
        setSeqEdits(edits);
      }
    } catch (err) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Backfill Failed',
        message: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'danger',
        confirmText: 'OK',
        onConfirm: () => setConfirmModalConfig(null),
      });
    } finally {
      setIsBackfilling(false);
    }
  }, [canCreateSettings]);

  const handleBackfillSuppliers = useCallback(() => {
    if (!canCreateSettings) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Assign Supplier Codes',
      message: 'This will assign sequential supplier codes to all existing vendors that do not have one. New vendors will continue from the next counter. Continue?',
      variant: 'primary',
      confirmText: 'Yes, Assign Codes',
      cancelText: 'Cancel',
      onConfirm: runBackfill,
    });
  }, [runBackfill, canCreateSettings]);



  const getSeqPreview = useCallback((entityType: string): string => {
    const e = seqEdits[entityType];
    if (!e) return '—';
    const num = Number(e.nextNumber ?? 1);
    const pad = Number(e.paddingLength ?? 4);
    const prefix = resolvePlaceholders(String(e.prefix ?? ''));
    const suffix = resolvePlaceholders(String(e.suffix ?? ''));
    return `${prefix}${String(num).padStart(pad, '0')}${suffix ? '-' + suffix : ''}`;
  }, [seqEdits, resolvePlaceholders]);


  const ENTITY_LABELS: Record<string, { label: string; desc: string }> = {
    SUPPLIER_CODE: { label: 'Supplier Code', desc: 'Auto-generated code assigned when a new supplier is created.' },
    PURCHASE_ORDER: { label: 'Purchase Order No.', desc: 'Sequential number assigned to each new Purchase Order.' },
    RFQ: { label: 'RFQ Number', desc: 'Sequential number assigned to each new Request for Quotation.' },
    INVOICE: { label: 'Invoice Number', desc: 'Sequential number assigned to each new Purchase Invoice.' },
    CONTRACT: { label: 'Contract Number', desc: 'Sequential number assigned to each new Contract.' },
    PAYMENT_VOUCHER: { label: 'Payment Voucher No.', desc: 'Sequential number assigned to each new Payment Voucher.' },
  };
  const [search, setSearch] = useState('');
  const [expandedDept, setExpandedDept] = useState<Set<number>>(new Set());
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const [langMsg, setLangMsg] = useState<string | null>(null);

  // Auto-dismiss language toast notification after 3 seconds
  useEffect(() => {
    if (!langMsg) return;
    const timer = setTimeout(() => {
      setLangMsg(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [langMsg]);

  // Currency default
  const { companyDefaultCurrency: ctxDefaultCurrency, setCompanyDefaultCurrency } = useCurrency();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const [savingCurrency, setSavingCurrency] = useState(false);

  // Portal name
  const [portalName, setPortalName] = useState('Employee');
  const [pendingPortalName, setPendingPortalName] = useState<string | null>(null);

  // Time limit settings
  const [invitationExpiryHours, setInvitationExpiryHours] = useState(168);
  const [resubmissionDeadlineHours, setResubmissionDeadlineHours] = useState(72);
  const [pendingInvitationExpiry, setPendingInvitationExpiry] = useState<number | null>(null);
  const [pendingResubmissionDeadline, setPendingResubmissionDeadline] = useState<number | null>(null);
  const [pendingMaxUsers, setPendingMaxUsers] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await companySettingsService.getCompanyProfile();
        setProfile(p);
        setInvitationExpiryHours(p.invitationExpiryHours ?? 168);
        setResubmissionDeadlineHours(p.resubmissionDeadlineHours ?? 72);
        setPortalName(p.primaryPortalName || 'Employee');
      } catch {
        // ignore
      }
    })();
  }, []);

  // ── Passcode Protection State ──
  const [lockPasscode, setLockPasscode] = useState<string>('');
  const [lockError, setLockError] = useState<string | null>(null);
  const [verifyingLock, setVerifyingLock] = useState<boolean>(false);
  const [showPasscodeModal, setShowPasscodeModal] = useState<boolean>(false);
  const [passcodeModalMode, setPasscodeModalMode] = useState<'set' | 'change' | 'remove'>('set');

  // Passcode Modal Form State
  const [passcodeCurrent, setPasscodeCurrent] = useState<string>('');
  const [passcodeNew, setPasscodeNew] = useState<string>('');
  const [passcodeConfirm, setPasscodeConfirm] = useState<string>('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [passcodeSaving, setPasscodeSaving] = useState<boolean>(false);
  const [showPasscodeText, setShowPasscodeText] = useState<boolean>(false);
  const [showCurrentPasscodeText, setShowCurrentPasscodeText] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        setCheckingPasscodeStatus(true);
        const res = await companySettingsService.getSettingsPasswordStatus();
        setIsPasscodeProtected(res.isPasswordProtected);
        if (res.isPasswordProtected) {
          const sessionUnlocked = sessionStorage.getItem('heliflow_cs_unlocked') === 'true';
          setIsUnlocked(sessionUnlocked);
        } else {
          setIsUnlocked(true);
        }
      } catch {
        setIsUnlocked(true);
        setIsPasscodeProtected(false);
      } finally {
        setCheckingPasscodeStatus(false);
      }
    })();
  }, []);

  const handleUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockPasscode.trim()) return;
    setVerifyingLock(true);
    setLockError(null);
    try {
      const res = await companySettingsService.verifySettingsPassword(lockPasscode.trim());
      if (res.verified) {
        sessionStorage.setItem('heliflow_cs_unlocked', 'true');
        setIsUnlocked(true);
        setLockPasscode('');
      } else {
        setLockError('Incorrect Security Passcode. Access Denied.');
      }
    } catch (err) {
      setLockError(err instanceof Error ? err.message : 'Incorrect Security Passcode');
    } finally {
      setVerifyingLock(false);
    }
  }, [lockPasscode]);

  const handleSavePasscode = useCallback(async () => {
    if (!canCreateSettings) return;
    if (passcodeModalMode === 'remove') {
      if (!passcodeCurrent.trim()) {
        setPasscodeError('Current passcode is required to disable protection');
        return;
      }
      setPasscodeSaving(true);
      setPasscodeError(null);
      try {
        await companySettingsService.removeSettingsPassword(passcodeCurrent.trim());
        sessionStorage.removeItem('heliflow_cs_unlocked');
        setIsPasscodeProtected(false);
        setIsUnlocked(true);
        setShowPasscodeModal(false);
        setPasscodeCurrent('');
        setPasscodeNew('');
        setPasscodeConfirm('');
        setPageMsg('Company Settings Security Passcode disabled.');
      } catch (err) {
        setPasscodeError(err instanceof Error ? err.message : 'Incorrect passcode. Could not disable protection.');
      } finally {
        setPasscodeSaving(false);
      }
      return;
    }

    if (passcodeNew.length < 4) {
      setPasscodeError('New passcode must be at least 4 characters');
      return;
    }
    if (passcodeNew !== passcodeConfirm) {
      setPasscodeError('Passcodes do not match');
      return;
    }
    if (isPasscodeProtected && passcodeModalMode === 'change' && !passcodeCurrent.trim()) {
      setPasscodeError('Current passcode is required');
      return;
    }

    setPasscodeSaving(true);
    setPasscodeError(null);
    try {
      await companySettingsService.updateSettingsPassword(passcodeNew.trim(), isPasscodeProtected ? passcodeCurrent.trim() : undefined);
      sessionStorage.setItem('heliflow_cs_unlocked', 'true');
      setIsPasscodeProtected(true);
      setIsUnlocked(true);
      setShowPasscodeModal(false);
      setPasscodeCurrent('');
      setPasscodeNew('');
      setPasscodeConfirm('');
      setPageMsg('Company Settings Security Passcode updated successfully.');
    } catch (err) {
      setPasscodeError(err instanceof Error ? err.message : 'Failed to save passcode');
    } finally {
      setPasscodeSaving(false);
    }
  }, [passcodeModalMode, passcodeCurrent, passcodeNew, passcodeConfirm, isPasscodeProtected, canCreateSettings]);

  // The currently saved currency from the backend
  const savedCurrency = profile?.defaultCurrency || ctxDefaultCurrency;
  // Effective display value: use pending if different from saved, else saved
  const displayCurrency = pendingCurrency !== null ? pendingCurrency : savedCurrency;
  const hasPendingChange = pendingCurrency !== null && pendingCurrency !== savedCurrency;

  const handleCurrencySelect = useCallback((code: string) => {
    if (!canCreateSettings) return;
    // Just store the selection - don't save yet
    setPendingCurrency(code);
  }, [canCreateSettings]);

  const hasPortalNameChange = pendingPortalName !== null && pendingPortalName !== portalName;
  const hasMaxUsersChange = pendingMaxUsers !== null && pendingMaxUsers !== (profile?.maxUsers ?? 50);

  const hasTimeLimitChanges = (pendingInvitationExpiry !== null && pendingInvitationExpiry !== invitationExpiryHours) ||
    (pendingResubmissionDeadline !== null && pendingResubmissionDeadline !== resubmissionDeadlineHours);

  const handleSaveGeneralSettings = useCallback(async () => {
    if (!canCreateSettings) return;
    const currencyToSave = pendingCurrency || savedCurrency;
    const invExpiry = pendingInvitationExpiry !== null ? pendingInvitationExpiry : invitationExpiryHours;
    const resubDeadline = pendingResubmissionDeadline !== null ? pendingResubmissionDeadline : resubmissionDeadlineHours;
    const nameToSave = pendingPortalName !== null ? pendingPortalName : portalName;

    if (!hasPendingChange && !hasTimeLimitChanges && !hasPortalNameChange && !hasMaxUsersChange) return;

    setSavingCurrency(true);
    setPageMsg(null);
    try {
      const payload: Record<string, unknown> = {
        defaultCurrency: currencyToSave,
      };
      if (hasTimeLimitChanges) {
        payload.invitationExpiryHours = invExpiry;
        payload.resubmissionDeadlineHours = resubDeadline;
      }
      if (hasPortalNameChange) {
        payload.primaryPortalName = nameToSave;
      }
      if (hasMaxUsersChange) {
        payload.maxUsers = pendingMaxUsers;
      }
      const updated = await companySettingsService.updateCompanyProfile(payload);
      setProfile(updated);
      setCompanyDefaultCurrency(currencyToSave);
      setInvitationExpiryHours(updated.invitationExpiryHours);
      setResubmissionDeadlineHours(updated.resubmissionDeadlineHours);
      setPortalName(updated.primaryPortalName || 'Employee');
      setPendingCurrency(null);
      setPendingInvitationExpiry(null);
      setPendingResubmissionDeadline(null);
      setPendingPortalName(null);
      setPendingMaxUsers(null);

      // Refresh branding context so login pages reflect the change immediately
      if (hasPortalNameChange) {
        refreshBranding();
      }

      const changes: string[] = [];
      if (hasPendingChange) changes.push(`currency changed to ${currencyToSave}`);
      if (hasTimeLimitChanges) changes.push('time limits updated');
      if (hasPortalNameChange) changes.push(`portal name changed to "${nameToSave}"`);
      setPageMsg(`Settings saved: ${changes.join(', ')}.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingCurrency(false);
    }
  }, [pendingCurrency, savedCurrency, pendingInvitationExpiry, invitationExpiryHours, pendingResubmissionDeadline, resubmissionDeadlineHours, hasPendingChange, hasTimeLimitChanges, hasPortalNameChange, pendingPortalName, portalName, setCompanyDefaultCurrency]);

  const handleCurrencyCancel = useCallback(() => {
    setPendingCurrency(null);
    setPendingInvitationExpiry(null);
    setPendingResubmissionDeadline(null);
    setPendingPortalName(null);
  }, []);

  // ── White Label / Branding ──
  const { refresh: refreshBranding } = useBranding();
  const [brandingName, setBrandingName] = useState('');
  const [brandingLogoUrl, setBrandingLogoUrl] = useState('');
  const [brandingFaviconUrl, setBrandingFaviconUrl] = useState('');
  const [brandingColor, setBrandingColor] = useState('#0a6ed1');
  const [brandingLoginText, setBrandingLoginText] = useState('');
  const [brandingSupportEmail, setBrandingSupportEmail] = useState('');
  const [brandingCompanyPhone, setBrandingCompanyPhone] = useState('');
  const [brandingCompanyEmail, setBrandingCompanyEmail] = useState('');
  const [brandingDirty, setBrandingDirty] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const brandingInitialized = useRef(false);

  // Load branding from profile once
  useEffect(() => {
    if (profile && !brandingInitialized.current) {
      brandingInitialized.current = true;
      setBrandingName(profile.companyName || '');
      setBrandingLogoUrl(profile.logoUrl || '');
      setBrandingFaviconUrl(profile.faviconUrl || '');
      setBrandingColor(profile.primaryColor || '#0a6ed1');
      setBrandingLoginText(profile.loginText || '');
      setBrandingSupportEmail(profile.supportEmail || '');
      setBrandingCompanyPhone(profile.companyPhone || '');
      setBrandingCompanyEmail(profile.companyEmail || '');
    }
  }, [profile]);

  const handleSaveBranding = useCallback(async () => {
    if (!canCreateSettings) return;
    if (!brandingDirty) return;
    setSavingBranding(true);
    setPageMsg(null);
    try {
      const payload: Record<string, unknown> = {};
      if (brandingName !== (profile?.companyName || '')) payload.companyName = brandingName;
      if (brandingLogoUrl !== (profile?.logoUrl || '')) {
        payload.logoUrl = brandingLogoUrl;
        payload.faviconUrl = brandingLogoUrl;
      }
      if (brandingColor !== (profile?.primaryColor || '#0a6ed1')) payload.primaryColor = brandingColor;
      if (brandingLoginText !== (profile?.loginText || '')) payload.loginText = brandingLoginText;
      if (brandingSupportEmail !== (profile?.supportEmail || '')) payload.supportEmail = brandingSupportEmail;
      if (brandingCompanyPhone !== (profile?.companyPhone || '')) payload.companyPhone = brandingCompanyPhone;
      if (brandingCompanyEmail !== (profile?.companyEmail || '')) payload.companyEmail = brandingCompanyEmail;

      if (Object.keys(payload).length === 0) {
        setPageMsg('No changes to save.');
        return;
      }

      const updated = await companySettingsService.updateCompanyProfile(payload);
      setProfile(updated);
      setBrandingDirty(false);
      setPageMsg('Branding settings saved successfully! Changes applied immediately.');
      refreshBranding();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save branding settings');
    } finally {
      setSavingBranding(false);
    }
  }, [brandingDirty, brandingName, brandingLogoUrl, brandingColor, brandingLoginText, brandingSupportEmail, brandingCompanyPhone, brandingCompanyEmail, profile, refreshBranding, canCreateSettings]);

  const markBrandingDirty = useCallback(() => {
    if (!canCreateSettings) return;
    if (!brandingDirty) setBrandingDirty(true);
  }, [brandingDirty, canCreateSettings]);

  // ── Image Cropper (after branding so all variables are declared) ──
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropType, setCropType] = useState<'logo'>('logo');

  const handleCropAndUpload = useCallback(async (blob: Blob) => {
    setCropFile(null);
    setUploadingLogo(true);
    try {
      const file = new File([blob], `logo-${Date.now()}.png`, { type: 'image/png' });
      const result = await companySettingsService.uploadBrandingImage('logo', file);
      setBrandingLogoUrl(result.url);
      setBrandingFaviconUrl(result.url);
      // Apply favicon immediately to browser tab
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement('link');
      link.rel = 'icon';
      link.href = result.url;
      if (!link.parentNode) document.head.appendChild(link);

      setProfile(result.profile);
      setPageMsg('Logo uploaded successfully!');
      // Bust the GET cache for /company-settings/profile so refreshBranding()
      // fetches fresh data (uploadBrandingImage uses raw fetch, not apiRequest)
      invalidateApiCache('/company-settings/profile');
      refreshBranding();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingLogo(false);
    }
  }, [refreshBranding]);

  // Modal state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [deptError, setDeptError] = useState<string | null>(null);

  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catDeptId, setCatDeptId] = useState<string>('');
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catError, setCatError] = useState<string | null>(null);

  // Unit modal state
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [unitName, setUnitName] = useState('');
  const [selectedPresetUnit, setSelectedPresetUnit] = useState('');
  const [unitError, setUnitError] = useState<string | null>(null);

  // Payment Term modal state
  const [showPaymentTermModal, setShowPaymentTermModal] = useState(false);
  const [paymentTermName, setPaymentTermName] = useState('');
  const [paymentTermError, setPaymentTermError] = useState<string | null>(null);

  // Position modal state
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [positionName, setPositionName] = useState('');
  const [positionDesc, setPositionDesc] = useState('');
  const [positionError, setPositionError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'department' | 'category' | 'unit' | 'position' | 'paymentTerm' | 'requiredDocument'; id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Financial Year Configuration Modal State
  const [fyModalEntity, setFyModalEntity] = useState<string | null>(null);

  // Custom confirmation modal state
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  // Filtered departments
  const filtered = search.trim()
    ? departments.filter(
        (d) => d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.description?.toLowerCase().includes(search.toLowerCase())
      )
    : departments;

  // Categories grouped by department
  const categoriesByDept = new Map<number, Category[]>();
  for (const cat of categories) {
    const existing = categoriesByDept.get(cat.departmentId);
    if (existing) existing.push(cat);
    else categoriesByDept.set(cat.departmentId, [cat]);
  }

  const toggleExpand = (id: number) => {
    setExpandedDept((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Email Templates ──
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [emailTemplatesLoading, setEmailTemplatesLoading] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const [editedBodyHtml, setEditedBodyHtml] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [emailSearchQuery, setEmailSearchQuery] = useState('');
  const [emailFilterType, setEmailFilterType] = useState('ALL');

  const filteredEmailTemplateKeys = useMemo(() => {
    return EMAIL_TEMPLATE_KEYS.filter(key => {
      const label = EMAIL_TEMPLATE_LABELS[key] || key;
      const matchesSearch = !emailSearchQuery.trim() ||
        label.toLowerCase().includes(emailSearchQuery.toLowerCase()) ||
        key.toLowerCase().includes(emailSearchQuery.toLowerCase());

      const saved = emailTemplates.find(t => t.templateKey === key);
      const isCustom = !!saved && saved.bodyHtml !== '' && saved.bodyHtml !== undefined;

      if (emailFilterType === 'CUSTOMIZED') return matchesSearch && isCustom;
      if (emailFilterType === 'DEFAULT') return matchesSearch && !isCustom;
      return matchesSearch;
    });
  }, [emailTemplates, emailSearchQuery, emailFilterType, EMAIL_TEMPLATE_KEYS, EMAIL_TEMPLATE_LABELS]);

  const selectedTemplate = emailTemplates.find((t) => t.templateKey === selectedTemplateKey);
  const isDefaultTemplate = selectedTemplate && !emailTemplates.find(
    (t) => t.templateKey === selectedTemplateKey
  )?.subject;

  const fetchEmailTemplates = useCallback(async () => {
    setEmailTemplatesLoading(true);
    try {
      const templates = await companySettingsService.listEmailTemplates();
      setEmailTemplates(templates);
    } catch {
      // ignore
    } finally {
      setEmailTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'email-templates') {
      fetchEmailTemplates();
    }
  }, [activeTab, fetchEmailTemplates]);

  const handleSelectTemplate = useCallback((key: string) => {
    const proceed = () => {
      setSelectedTemplateKey(key);
      setTemplateDirty(false);
      const tmpl = emailTemplates.find((t) => t.templateKey === key);
      setEditedBodyHtml(tmpl?.bodyHtml || '');
    };
    if (templateDirty) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard them?',
        confirmText: 'Discard',
        cancelText: 'Cancel',
        variant: 'warning',
        onConfirm: proceed,
      });
    } else {
      proceed();
    }
  }, [emailTemplates, templateDirty]);

  const handleBodyChange = useCallback((html: string) => {
    setEditedBodyHtml(html);
    setTemplateDirty(true);
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    if (!selectedTemplateKey || !editedBodyHtml) return;
    setSavingTemplate(true);
    setPageMsg(null);
    try {
      const updated = await companySettingsService.updateEmailTemplate(selectedTemplateKey, editedBodyHtml);
      setEmailTemplates((prev) =>
        prev.map((t) => (t.templateKey === selectedTemplateKey ? updated : t))
      );
      setTemplateDirty(false);
      setPageMsg(`Email template "${EMAIL_TEMPLATE_LABELS[selectedTemplateKey] || selectedTemplateKey}" updated.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  }, [selectedTemplateKey, editedBodyHtml]);

  const handleResetTemplate = useCallback(async () => {
    if (!selectedTemplateKey) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Reset Email Template?',
      message: 'Reset this template to its default content? Unsaved changes will be discarded.',
      confirmText: 'Reset Content',
      cancelText: 'Cancel',
      variant: 'warning',
      onConfirm: async () => {
        setSavingTemplate(true);
        setPageMsg(null);
        try {
          await companySettingsService.resetEmailTemplate(selectedTemplateKey);
          setEditedBodyHtml('');
          setTemplateDirty(false);
          await fetchEmailTemplates();
          setPageMsg(`Email template "${EMAIL_TEMPLATE_LABELS[selectedTemplateKey] || selectedTemplateKey}" reset to default.`);
        } catch (err) {
          setPageMsg(err instanceof Error ? err.message : 'Failed to reset template');
        } finally {
          setSavingTemplate(false);
        }
      },
    });
  }, [selectedTemplateKey, fetchEmailTemplates]);

  // ── Contract Templates (Company Settings) state ──
  const [contractTemplates, setContractTemplates] = useState<ContractTemplate[]>([]);
  const [contractTemplatesLoading, setContractTemplatesLoading] = useState(false);
  const [selectedContractType, setSelectedContractType] = useState<string | null>(null);
  const [editedContractContent, setEditedContractContent] = useState('');
  const [editedContractName, setEditedContractName] = useState('');
  const [editedContractDescription, setEditedContractDescription] = useState('');
  const [editedContractIsActive, setEditedContractIsActive] = useState(true);
  const [contractPreviewOpen, setContractPreviewOpen] = useState(false);
  const [contractTemplateDirty, setContractTemplateDirty] = useState(false);
  const [savingContractTemplate, setSavingContractTemplate] = useState(false);
  const [editingNewContractType, setEditingNewContractType] = useState(false);
  const [newContractTypeName, setNewContractTypeName] = useState('');
  const [renamingContractType, setRenamingContractType] = useState<string | null>(null);
  const [renamingContractTypeName, setRenamingContractTypeName] = useState('');
  const [deleteContractTypeTarget, setDeleteContractTypeTarget] = useState<string | null>(null);
  const [contractFileUploading, setContractFileUploading] = useState(false);
  const [contractSearchQuery, setContractSearchQuery] = useState('');
  const [contractFilterType, setContractFilterType] = useState('ALL');
  const ocrPollActiveRef = useRef(false);

  const filteredContractTemplates = useMemo(() => {
    return contractTemplates.filter(t => {
      const matchesSearch = !contractSearchQuery.trim() ||
        t.name.toLowerCase().includes(contractSearchQuery.toLowerCase()) ||
        t.type.toLowerCase().includes(contractSearchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [contractTemplates, contractSearchQuery]);

  const CONTRACT_PLACEHOLDERS: Record<string, string> = {
    '{{company_name}}': 'Company name',
    '{{vendor_name}}': 'Vendor name',
    '{{vendor_address}}': 'Vendor address',
    '{{vendor_email}}': 'Vendor email',
    '{{vendor_contact}}': 'Vendor contact',
    '{{rfq_number}}': 'RFQ number',
    '{{contract_number}}': 'Auto-generated contract number',
    '{{effective_date}}': 'Contract effective date',
    '{{expiry_date}}': 'Contract expiry date',
    '{{payment_terms}}': 'Payment terms',
    '{{delivery_terms}}': 'Delivery terms',
    '{{currency}}': 'Currency code',
    '{{contract_value}}': 'Contract value',
    '{{created_date}}': 'Creation date',
    '{{companySignature}}': 'Company signature image (auto-embedded from default signature)',
    '{{company_signature}}': 'Company signature image (auto-embedded from default signature)',
  };

  const fetchContractTemplates = useCallback(async () => {
    setContractTemplatesLoading(true);
    try {
      const templates = await companySettingsService.listContractTemplates();
      // Reset any PROCESSING status from backend — OCR should only show as
      // processing when the user explicitly clicks "Run OCR" in the preview.
      const cleaned = templates.map(t => ({
        ...t,
        ocrStatus: t.ocrStatus === 'PROCESSING' ? null : t.ocrStatus,
      }));
      setContractTemplates(cleaned);
    } catch {
      // ignore
    } finally {
      setContractTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'documents-contracts') {
      fetchContractTemplates();
    }
  }, [activeTab, fetchContractTemplates]);

  const selectedContractTemplate = contractTemplates.find(t => t.type === selectedContractType);
  const contractTemplateIsDefault = !selectedContractTemplate || selectedContractTemplate.version <= 1;

  const handleSelectContractType = useCallback(async (type: string) => {
    const proceed = async () => {
      setSelectedContractType(type);
      setContractTemplateDirty(false);
      const tmpl = contractTemplates.find(t => t.type === type);
      if (tmpl && tmpl.content) {
        setEditedContractContent(tmpl.content);
        setEditedContractName(tmpl.name || type);
        setEditedContractDescription(tmpl?.description || '');
        setEditedContractIsActive(tmpl?.isActive ?? true);
      } else {
        // No saved template with content — fetch default content from backend
        try {
          const result = await companySettingsService.getContractTemplate(type);
          if (result?.defaultContent) {
            setEditedContractContent(result.defaultContent);
          } else if (result?.template?.content) {
            setEditedContractContent(result.template.content);
          }
          if (result?.template) {
            setEditedContractName(result.template.name || type);
            setEditedContractDescription(result.template.description || '');
            setEditedContractIsActive(result.template.isActive ?? true);
          } else {
            setEditedContractName(type);
          }
        } catch { /* ignore */
          setEditedContractName(tmpl?.name || type);
        }
      }
    };
    if (contractTemplateDirty) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard them?',
        confirmText: 'Discard',
        cancelText: 'Cancel',
        variant: 'warning',
        onConfirm: proceed,
      });
    } else {
      await proceed();
    }
  }, [contractTemplates, contractTemplateDirty]);

  const handleContractContentChange = useCallback((html: string) => {
    setEditedContractContent(html);
    setContractTemplateDirty(true);
  }, []);

  const handleContractNameChange = useCallback((name: string) => {
    setEditedContractName(name);
    setContractTemplateDirty(true);
  }, []);

  const handleSaveContractTemplate = useCallback(async () => {
    if (!selectedContractType || !editedContractContent) return;
    setSavingContractTemplate(true);
    setPageMsg(null);
    try {
      const updated = await companySettingsService.saveContractTemplate(selectedContractType, {
        name: editedContractName.trim(),
        content: editedContractContent,
        description: editedContractDescription.trim() || null,
        isActive: editedContractIsActive,
      });
      setContractTemplates((prev) => {
        const filtered = prev.filter(t => t.type !== selectedContractType);
        return [...filtered, updated];
      });
      setContractTemplateDirty(false);
      setPageMsg(`${selectedContractType} template saved successfully.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save contract template');
    } finally {
      setSavingContractTemplate(false);
    }
  }, [selectedContractType, editedContractContent, editedContractName, editedContractDescription, editedContractIsActive]);

  const handleResetContractTemplate = useCallback(async () => {
    if (!selectedContractType) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Reset Contract Template?',
      message: 'Reset this contract template content and clear uploaded files? Unsaved changes will be discarded.',
      confirmText: 'Reset Content',
      cancelText: 'Cancel',
      variant: 'warning',
      onConfirm: async () => {
        setSavingContractTemplate(true);
        setPageMsg(null);
        try {
          const tmpl = contractTemplates.find(t => t.type === selectedContractType);
          const typeLabel = tmpl?.name || selectedContractType;
          const defaultHtml = `<h1>${typeLabel}</h1><p>Template for {{contractType}}.</p>`;

          setEditedContractContent(defaultHtml);
          if (tmpl) {
            setEditedContractName(typeLabel);
            setEditedContractDescription('');
            setEditedContractIsActive(true);
          }

          // Clear file & OCR state locally
          setContractTemplates(prev => prev.map(t =>
            t.type === selectedContractType
              ? { ...t, content: defaultHtml, fileUrl: null, fileName: null, fileType: null, ocrStatus: null, ocrText: null, ocrProcessedAt: null }
              : t
          ));

          // Persist reset to backend
          await companySettingsService.saveContractTemplate(selectedContractType, {
            name: typeLabel,
            content: defaultHtml,
            description: null,
            isActive: true,
            fileUrl: null,
            fileName: null,
            fileType: null,
          });

          setContractTemplateDirty(false);
          setPageMsg('Template content and uploaded files reset to default.');
        } catch (err) {
          setPageMsg(err instanceof Error ? err.message : 'Failed to reset template');
        } finally {
          setSavingContractTemplate(false);
        }
      },
    });
  }, [selectedContractType, contractTemplates]);

  const handleCreateNewContractType = useCallback(async () => {
    const typeName = newContractTypeName.trim()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .toUpperCase()
      .replace(/\s+/g, '_');
    if (!typeName) return;
    setSavingContractTemplate(true);
    setPageMsg(null);
    try {
      const created = await companySettingsService.saveContractTemplate(typeName, {
        name: newContractTypeName.trim(),
        content: '<h1>' + newContractTypeName.trim() + '</h1><p>Template for {{contractType}}.</p>',
        isActive: true,
      });
      setContractTemplates(prev => [...prev, created]);
      setSelectedContractType(typeName);
      setEditedContractContent(created.content);
      setEditedContractName(created.name);
      setEditingNewContractType(false);
      setNewContractTypeName('');
      setPageMsg('Contract type "' + newContractTypeName.trim() + '" created. Edit the content below.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to create contract type');
    } finally {
      setSavingContractTemplate(false);
    }
  }, [newContractTypeName]);

  const handleRenameContractType = useCallback(async (type: string, newName: string) => {
    if (!newName.trim() || newName.trim() === contractTemplates.find(t => t.type === type)?.name) {
      setRenamingContractType(null);
      return;
    }
    setSavingContractTemplate(true);
    setPageMsg(null);
    try {
      const updated = await companySettingsService.saveContractTemplate(type, {
        name: newName.trim(),
        content: contractTemplates.find(t => t.type === type)?.content || '',
        isActive: true,
      });
      setContractTemplates(prev => prev.map(t => t.type === type ? updated : t));
      if (selectedContractType === type) {
        setEditedContractName(updated.name);
      }
      setRenamingContractType(null);
      setPageMsg(`Contract type renamed to "${newName.trim()}".`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to rename contract type');
    } finally {
      setSavingContractTemplate(false);
    }
  }, [contractTemplates, selectedContractType]);

  const handleDeleteContractType = useCallback((type: string) => {
    setDeleteContractTypeTarget(type);
  }, []);

  const handleDeleteContractTypeConfirm = useCallback(async () => {
    const type = deleteContractTypeTarget;
    if (!type) return;
    const template = contractTemplates.find(t => t.type === type);
    const typeLabel = template?.name || type;
    setSavingContractTemplate(true);
    setPageMsg(null);
    setDeleteContractTypeTarget(null);
    try {
      await companySettingsService.deleteContractTemplate(type);
      setContractTemplates(prev => prev.filter(t => t.type !== type));
      // Re-fetch to reload default templates from backend
      fetchContractTemplates();
      if (selectedContractType === type) {
        setSelectedContractType(null);
        setEditedContractContent('');
        setEditedContractName('');
      }
      setPageMsg(`Contract type "${typeLabel}" deleted.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to delete contract type');
    } finally {
      setSavingContractTemplate(false);
    }
  }, [deleteContractTypeTarget, contractTemplates, selectedContractType]);

  const cancelDeleteContractType = useCallback(() => {
    setDeleteContractTypeTarget(null);
  }, []);

  // ── OCR Handlers ──
  const handleTriggerContractOcr = useCallback(async () => {
    if (!selectedContractType) return;
    // Cancel any previous OCR polling
    ocrPollActiveRef.current = false;

    // Show processing state inside the OCR Preview box immediately
    setContractTemplates(prev => prev.map(t =>
      t.type === selectedContractType
        ? { ...t, ocrStatus: 'PROCESSING' }
        : t
    ));
    try {
      await companySettingsService.triggerContractOcr(selectedContractType);

      const typeAtTrigger = selectedContractType;
      const MAX_POLL_MS = 180000; // 3 minutes for large scanned documents
      const INTERVAL_MS = 2000;
      const LONG_INTERVAL_MS = 5000;
      const startTime = Date.now();
      ocrPollActiveRef.current = true;

      const poll = async () => {
        if (!ocrPollActiveRef.current) return;

        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_POLL_MS) {
          ocrPollActiveRef.current = false;
          setContractTemplates(prev => prev.map(t =>
            t.type === typeAtTrigger ? { ...t, ocrStatus: t.ocrStatus === 'PROCESSING' ? (t.ocrText ? 'COMPLETED' : null) : t.ocrStatus } : t
          ));
          setPageMsg('OCR request timed out. Please check your document and try again.');
          return;
        }
        try {
          const status = await companySettingsService.getContractOcrStatus(typeAtTrigger);
          if (status.ocrStatus === 'COMPLETED' || status.ocrStatus === 'FAILED') {
            ocrPollActiveRef.current = false;
            // Bust cache so next fetchContractTemplates gets fresh data
            invalidateApiCache('/company-settings/contract-templates');
            setContractTemplates(prev => prev.map(t =>
              t.type === typeAtTrigger
                ? { ...t, ocrText: status.ocrText, ocrStatus: status.ocrStatus, ocrProcessedAt: status.ocrProcessedAt }
                : t
            ));
            if (status.ocrStatus === 'COMPLETED' && status.ocrText) {
              // Convert plain text with layout to HTML for the rich text editor
              setEditedContractContent(textToHtml(status.ocrText));
              setContractTemplateDirty(true);
              setPageMsg('OCR completed! Extracted text loaded into editor. Review the text and click "Save" to apply changes.');
            } else if (status.ocrStatus === 'FAILED') {
              setPageMsg('OCR failed. The uploaded file may contain no readable text.');
            }
          } else {
            // Use longer interval if we've already waited a while
            const interval = elapsed >= 60000 ? LONG_INTERVAL_MS : INTERVAL_MS;
            setTimeout(poll, interval);
          }
        } catch {
          // On API error, retry with the appropriate interval
          const interval = elapsed >= 60000 ? LONG_INTERVAL_MS : INTERVAL_MS;
          setTimeout(poll, interval);
        }
      };

      // Start polling after a short initial delay
      setTimeout(poll, 3000);
    } catch (err) {
      ocrPollActiveRef.current = false;
      setContractTemplates(prev => prev.map(t =>
        t.type === selectedContractType
          ? { ...t, ocrStatus: null }
          : t
      ));
      setPageMsg(err instanceof Error ? err.message : 'Failed to trigger OCR');
    }
  }, [selectedContractType]);

  // Cancel OCR polling on unmount
  useEffect(() => {
    return () => { ocrPollActiveRef.current = false; };
  }, []);

  // Cancel document OCR polling on unmount
  useEffect(() => {
    return () => { docOcrPollActiveRef.current = false; };
  }, []);

  const handleSaveContractOcrText = useCallback(async (text: string) => {
    if (!selectedContractType) return;
    try {
      await companySettingsService.saveContractOcrText(selectedContractType, text);
      setContractTemplates(prev => prev.map(t =>
        t.type === selectedContractType ? { ...t, ocrText: text } : t
      ));
      setPageMsg('OCR text saved.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save OCR text');
    }
  }, [selectedContractType]);

  // ── Document Templates (NDA / MNDA) state ──
  // Supports MULTIPLE templates per type (like Contract Templates)
  const [documentTemplates, setDocumentTemplates] = useState<DocumentTemplate[]>([]);
  const [docTemplatesLoading, setDocTemplatesLoading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [editedDocContent, setEditedDocContent] = useState('');
  const [editedDocName, setEditedDocName] = useState('');
  const [docTemplateDirty, setDocTemplateDirty] = useState(false);
  const [savingDocTemplate, setSavingDocTemplate] = useState(false);
  const [docFileUploading, setDocFileUploading] = useState(false);
  const [editingNewDoc, setEditingNewDoc] = useState<'NDA' | 'MNDA' | 'ANY_OTHER' | null>(null);
  const [newDocName, setNewDocName] = useState('');
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renamingDocName, setRenamingDocName] = useState('');
  const [deleteDocIdTarget, setDeleteDocIdTarget] = useState<string | null>(null);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'ALL' | 'NDA' | 'MNDA' | 'ANY_OTHER'>('ALL');
  const docOcrPollActiveRef = useRef(false);

  // Derived values for the currently selected document template
  const selectedDocTemplate = useMemo(
    () => documentTemplates.find(t => t.id === selectedDocId) || null,
    [documentTemplates, selectedDocId]
  );
  const docTemplateIsDefault = !selectedDocTemplate || selectedDocTemplate.version <= 1;

  const filteredDocTemplates = useMemo(() => {
    return documentTemplates.filter(t => {
      const matchesType = docTypeFilter === 'ALL' || t.type === docTypeFilter;
      const matchesSearch = !docSearchQuery.trim() || t.name.toLowerCase().includes(docSearchQuery.toLowerCase()) || t.type.toLowerCase().includes(docSearchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [documentTemplates, docTypeFilter, docSearchQuery]);

  const DOC_TEMPLATE_TYPES = ['NDA', 'MNDA', 'ANY_OTHER'] as const;
  const DOC_TEMPLATE_LABELS: Record<string, string> = {
    'NDA': 'Non-Disclosure Agreement',
    'MNDA': 'Mutual Non-Disclosure Agreement',
    'ANY_OTHER': 'Any Other Document',
  };

  const DOC_TEMPLATE_PLACEHOLDERS: Record<string, string> = {
    '{{companyName}}': 'Company name from Company Settings',
    '{{companyAddress}}': 'Company address from Company Settings',
    '{{companyEmail}}': 'Company support email from Company Settings',
    '{{companyPhone}}': 'Company phone number',
    '{{companySignatory}}': 'Company signatory name',
    '{{companyDesignation}}': 'Company signatory designation/title',
    '{{companySignature}}': 'Company signature image (auto-embedded)',
    '{{vendorName}}': 'Vendor/supplier company name',
    '{{vendorCompany}}': 'Vendor company name',
    '{{vendorEmail}}': 'Vendor email address',
    '{{vendorPhone}}': 'Vendor phone number',
    '{{vendorAddress}}': 'Vendor address from onboarding form',
    '{{vendorSignature}}': 'Vendor signature image',
    '{{currentDate}}': 'Current date of document generation',
    '{{effectiveDate}}': 'Effective date of the agreement',
    '{{signedBy}}': 'Name of the company signatory',
    '{{signedFor}}': 'Name of the vendor signatory',
    'Snake case variants also work (e.g. {{company_name}})': 'All placeholders accept snake_case format too',
  };

  const fetchDocumentTemplates = useCallback(async () => {
    setDocTemplatesLoading(true);
    try {
      const templates = await companySettingsService.listDocumentTemplates();
      const cleaned = templates.map(t => ({
        ...t,
        ocrStatus: t.ocrStatus === 'PROCESSING' ? null : t.ocrStatus,
      }));
      setDocumentTemplates(cleaned);
    } catch {
      // ignore
    } finally {
      setDocTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'documents-contracts') {
      fetchDocumentTemplates();
    }
  }, [activeTab, fetchDocumentTemplates]);

  const handleSelectDocTemplate = useCallback((id: string) => {
    const proceed = () => {
      setSelectedDocId(id);
      setDocTemplateDirty(false);
      const tmpl = documentTemplates.find(t => t.id === id);
      if (tmpl) {
        setEditedDocContent(tmpl.content || '');
        setEditedDocName(tmpl.name || '');
      }
    };
    if (docTemplateDirty) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard them?',
        confirmText: 'Discard',
        cancelText: 'Cancel',
        variant: 'warning',
        onConfirm: proceed,
      });
    } else {
      proceed();
    }
  }, [documentTemplates, docTemplateDirty]);

  const handleDocContentChange = useCallback((html: string) => {
    setEditedDocContent(html);
    setDocTemplateDirty(true);
  }, []);

  const handleDocNameChange = useCallback((name: string) => {
    setEditedDocName(name);
    setDocTemplateDirty(true);
  }, []);

  const handleSaveDocTemplate = useCallback(async () => {
    if (!selectedDocId || !editedDocContent) return;
    setSavingDocTemplate(true);
    setPageMsg(null);
    try {
      const updated = await companySettingsService.updateDocumentTemplateById(selectedDocId, {
        name: editedDocName.trim(),
        content: editedDocContent,
        isActive: true,
      });
      setDocumentTemplates(prev => prev.map(t => t.id === selectedDocId ? updated : t));
      setDocTemplateDirty(false);
      setPageMsg(`Template "${updated.name}" saved successfully.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingDocTemplate(false);
    }
  }, [selectedDocId, editedDocContent, editedDocName]);

  const handleResetDocTemplate = useCallback(async () => {
    if (!selectedDocId) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Reset Document Template?',
      message: 'Reset this document template content? Unsaved changes will be discarded.',
      confirmText: 'Reset Content',
      cancelText: 'Cancel',
      variant: 'warning',
      onConfirm: () => {
        const tmpl = documentTemplates.find(t => t.id === selectedDocId);
        if (tmpl) {
          setEditedDocContent(tmpl.content);
          setEditedDocName(tmpl.name);
          setDocTemplateDirty(false);
          setPageMsg('Document template reset to saved state.');
        }
      },
    });
  }, [selectedDocId, documentTemplates]);

  const handleCreateNewDocTemplate = useCallback(async (type: 'NDA' | 'MNDA' | 'ANY_OTHER') => {
    const name = newDocName.trim();
    if (!name) return;
    setSavingDocTemplate(true);
    setPageMsg(null);
    try {
      const created = await companySettingsService.createDocumentTemplate(type, {
        name,
        content: `<h1>${name}</h1><p>Template for ${DOC_TEMPLATE_LABELS[type]}.</p>`,
        isActive: true,
      });
      setDocumentTemplates(prev => [...prev, created]);
      setSelectedDocId(created.id);
      setEditedDocContent(created.content);
      setEditedDocName(created.name);
      setEditingNewDoc(null);
      setNewDocName('');
      setPageMsg(`Document template "${name}" created.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setSavingDocTemplate(false);
    }
  }, [newDocName, DOC_TEMPLATE_LABELS]);

  const handleRenameDocTemplate = useCallback(async (id: string) => {
    const newName = renamingDocName.trim();
    if (!newName || newName === documentTemplates.find(t => t.id === id)?.name) {
      setRenamingDocId(null);
      return;
    }
    setSavingDocTemplate(true);
    setPageMsg(null);
    try {
      const tmpl = documentTemplates.find(t => t.id === id);
      if (!tmpl) return;
      const updated = await companySettingsService.updateDocumentTemplateById(id, {
        name: newName,
        content: tmpl.content,
        isActive: tmpl.isActive,
      });
      setDocumentTemplates(prev => prev.map(t => t.id === id ? updated : t));
      if (selectedDocId === id) setEditedDocName(updated.name);
      setRenamingDocId(null);
      setPageMsg(`Template renamed to "${newName}".`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to rename template');
    } finally {
      setSavingDocTemplate(false);
    }
  }, [renamingDocName, documentTemplates, selectedDocId]);

  const handleDeleteDocTemplate = useCallback(async (id: string) => {
    setDeleteDocIdTarget(id);
  }, []);

  const confirmDeleteDocTemplate = useCallback(async () => {
    const id = deleteDocIdTarget;
    if (!id) return;
    const tmpl = documentTemplates.find(t => t.id === id);
    const label = tmpl?.name || 'Template';
    setSavingDocTemplate(true);
    setPageMsg(null);
    setDeleteDocIdTarget(null);
    try {
      await companySettingsService.deleteDocumentTemplateById(id);
      setDocumentTemplates(prev => prev.filter(t => t.id !== id));
      if (selectedDocId === id) {
        setSelectedDocId(null);
        setEditedDocContent('');
        setEditedDocName('');
      }
      setPageMsg(`Template "${label}" deleted.`);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setSavingDocTemplate(false);
    }
  }, [deleteDocIdTarget, documentTemplates, selectedDocId]);

  const cancelDeleteDocTemplate = useCallback(() => {
    setDeleteDocIdTarget(null);
  }, []);

  // ── Document OCR Handlers ──
  const handleTriggerDocumentOcr = useCallback(async () => {
    if (!selectedDocTemplate) return;
    const type = selectedDocTemplate.type;
    docOcrPollActiveRef.current = false;

    setDocumentTemplates(prev => prev.map(t =>
      t.id === selectedDocId
        ? { ...t, ocrStatus: 'PROCESSING' }
        : t
    ));
    try {
      await companySettingsService.triggerDocumentOcr(type);
      const idAtTrigger = selectedDocId;
      const MAX_POLL_MS = 180000; // 3 minutes for large scanned documents
      const INTERVAL_MS = 2000;
      const LONG_INTERVAL_MS = 5000;
      const startTime = Date.now();
      docOcrPollActiveRef.current = true;

      const poll = async () => {
        if (!docOcrPollActiveRef.current) return;
        const elapsed = Date.now() - startTime;
        if (elapsed >= MAX_POLL_MS) {
          docOcrPollActiveRef.current = false;
          setDocumentTemplates(prev => prev.map(t =>
            t.id === idAtTrigger ? { ...t, ocrStatus: t.ocrStatus === 'PROCESSING' ? (t.ocrText ? 'COMPLETED' : null) : t.ocrStatus } : t
          ));
          setPageMsg('OCR request timed out. Please check your document and try again.');
          return;
        }
        try {
          const status = await companySettingsService.getDocumentOcrStatus(type);
          if (status.ocrStatus === 'COMPLETED' || status.ocrStatus === 'FAILED') {
            docOcrPollActiveRef.current = false;
            invalidateApiCache('/company-settings/document-templates');
            setDocumentTemplates(prev => prev.map(t =>
              t.id === idAtTrigger
                ? { ...t, ocrText: status.ocrText, ocrStatus: status.ocrStatus, ocrProcessedAt: status.ocrProcessedAt }
                : t
            ));
            if (status.ocrStatus === 'COMPLETED' && status.ocrText) {
              // Convert plain text with layout to HTML for the rich text editor
              setEditedDocContent(textToHtml(status.ocrText));
              setDocTemplateDirty(true);
              setPageMsg('OCR completed! Text extracted and applied as template content.');
            } else if (status.ocrStatus === 'FAILED') {
              setPageMsg('OCR failed. The uploaded file may contain no readable text.');
            }
          } else {
            // Use longer interval if we've already waited a while
            const interval = elapsed >= 60000 ? LONG_INTERVAL_MS : INTERVAL_MS;
            setTimeout(poll, interval);
          }
        } catch {
          // On API error, retry with the appropriate interval
          const interval = elapsed >= 60000 ? LONG_INTERVAL_MS : INTERVAL_MS;
          setTimeout(poll, interval);
        }
      };
      setTimeout(poll, 3000);
    } catch (err) {
      docOcrPollActiveRef.current = false;
      setDocumentTemplates(prev => prev.map(t =>
        t.id === selectedDocId ? { ...t, ocrStatus: null } : t
      ));
      setPageMsg(err instanceof Error ? err.message : 'Failed to trigger OCR');
    }
  }, [selectedDocTemplate, selectedDocId]);

  const handleSaveDocumentOcrText = useCallback(async (text: string) => {
    if (!selectedDocTemplate) return;
    const type = selectedDocTemplate.type;
    try {
      await companySettingsService.saveDocumentOcrText(type, text);
      setDocumentTemplates(prev => prev.map(t =>
        t.id === selectedDocId ? { ...t, ocrText: text } : t
      ));
      setPageMsg('OCR text saved.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save OCR text');
    }
  }, [selectedDocTemplate, selectedDocId]);

  const handleUploadDocumentFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDocTemplate) return;
    const type = selectedDocTemplate.type;
    setDocFileUploading(true);
    setPageMsg(null);
    try {
      const result = await companySettingsService.uploadDocumentTemplateFile(type, file);
      const extractedText = (result as any).ocrText;
      const ocrStatus = (result as any).ocrStatus || (extractedText ? 'COMPLETED' : null);

      setDocumentTemplates(prev => prev.map(t =>
        t.id === selectedDocId
          ? {
              ...t,
              fileUrl: result.fileUrl,
              fileName: result.fileName,
              fileType: result.fileType,
              ocrStatus: ocrStatus,
              ocrText: extractedText || t.ocrText,
              ocrProcessedAt: extractedText ? new Date().toISOString() : t.ocrProcessedAt,
            }
          : t
      ));

      if (extractedText) {
        setEditedDocContent(textToHtml(extractedText));
        setDocTemplateDirty(true);
        setPageMsg(`Document "${file.name}" uploaded and text extracted via OCR successfully!`);
      } else {
        setPageMsg(`Document "${file.name}" uploaded successfully! Click "Run OCR" to extract text.`);
      }
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setDocFileUploading(false);
      e.target.value = '';
    }
  }, [selectedDocTemplate, selectedDocId]);

  const handleRemoveDocumentFile = useCallback(async () => {
    if (!selectedDocTemplate) return;
    const type = selectedDocTemplate.type;
    setDocFileUploading(true);
    setPageMsg(null);
    try {
      await companySettingsService.updateDocumentTemplateById(selectedDocId!, {
        name: editedDocName.trim(),
        content: editedDocContent,
        isActive: true,
        fileUrl: null,
        fileName: null,
        fileType: null,
      });
      // Reset OCR data when file is removed
      setDocumentTemplates(prev => prev.map(t =>
        t.id === selectedDocId ? { ...t, fileUrl: null, fileName: null, fileType: null, ocrStatus: null, ocrText: null, ocrProcessedAt: null } : t
      ));
      setPageMsg('Uploaded file removed.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to remove file');
    } finally {
      setDocFileUploading(false);
    }
  }, [selectedDocTemplate, selectedDocId, editedDocName, editedDocContent]);

  const anyModalOpen = !!(showDeptModal || showCatModal || showUnitModal || showPositionModal || showPaymentTermModal || deleteTarget || cropFile || confirmModalConfig?.isOpen || showPasscodeModal);
  useBodyScrollLock(anyModalOpen);


  // Editable docs state (for inline editing matching Mandatory Information style)
  const [editableDocs, setEditableDocs] = useState<RequiredDocument[]>([]);
  const [docsDirty, setDocsDirty] = useState(false);
  const [savingDocs, setSavingDocs] = useState(false);

  // ── Form selection & Custom Flexi Fields state ──
  const [selectedFormKey, setSelectedFormKey] = useState<string | null>(null);
  const [formCustomFields, setFormCustomFields] = useState<FormFieldConfig[]>([]);
  const [formFieldsLoading, setFormFieldsLoading] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('alphabetical');
  const [addingFormField, setAddingFormField] = useState(false);

  const AVAILABLE_FORMS = [
    { key: 'vendor_onboarding', label: 'Vendor Onboarding Form' },
    { key: 'rfq_information', label: 'RFQ Information Form' },
  ];

  const fetchFormFields = useCallback(async (formKey: string) => {
    setFormFieldsLoading(true);
    try {
      const fields = await companySettingsService.listFormFieldConfigs(formKey);
      const customOnly = fields.filter((f) => f.sectionKey === 'custom_fields' || f.fieldKey.startsWith('cf_'));
      setFormCustomFields(customOnly);
    } catch {
      setFormCustomFields([]);
    } finally {
      setFormFieldsLoading(false);
    }
  }, []);

  const handleSelectForm = useCallback((formKey: string) => {
    setSelectedFormKey(formKey);
    fetchFormFields(formKey);
  }, [fetchFormFields]);

  const handleAddCustomField = useCallback(async () => {
    if (!selectedFormKey || !newFieldName.trim()) return;
    setAddingFormField(true);
    try {
      const fieldKey = `cf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await companySettingsService.createFormFieldConfig({
        formKey: selectedFormKey,
        fieldKey,
        label: newFieldName.trim(),
        fieldType: newFieldType,
        sectionKey: 'custom_fields',
        sectionLabel: 'Custom Fields',
        sortOrder: formCustomFields.length,
        isVisible: true,
      });
      setNewFieldName('');
      setNewFieldType('alphabetical');
      await fetchFormFields(selectedFormKey);
      setPageMsg('Flexi field created successfully!');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to create flexi field');
    } finally {
      setAddingFormField(false);
    }
  }, [selectedFormKey, newFieldName, newFieldType, formCustomFields.length, fetchFormFields]);

  const handleDeleteFormField = useCallback(async (id: string) => {
    if (!selectedFormKey) return;
    try {
      await companySettingsService.deleteFormFieldConfig(id);
      await fetchFormFields(selectedFormKey);
      setPageMsg('Flexi field deleted.');
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to delete field');
    }
  }, [selectedFormKey, fetchFormFields]);

  const handleToggleFormFieldVisibility = useCallback(async (id: string, currentVisible: boolean) => {
    if (!selectedFormKey) return;
    try {
      await companySettingsService.updateFormFieldConfig(id, { isVisible: !currentVisible });
      await fetchFormFields(selectedFormKey);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to update field');
    }
  }, [selectedFormKey, fetchFormFields]);

  // Sync editable docs from API data when it loads
  useEffect(() => {
    if (requiredDocuments.length > 0 && !docsDirty) {
      setEditableDocs(requiredDocuments);
    }
  }, [requiredDocuments, docsDirty]);

  const DOC_FIELD_TYPES = ['attachment', 'number', 'date', 'alphabetical', 'alphanumeric'] as const;

  const [addDocCategory, setAddDocCategory] = useState<'mandatory' | 'optional'>('mandatory');

  const addDocInline = useCallback((category: 'mandatory' | 'optional') => {
    const newDoc: RequiredDocument = {
      id: `new-${Date.now()}`,
      name: '',
      fieldType: 'attachment',
      documentCategory: category,
      isActive: true,
      expirationAlertDays: 30,
      expirationAlertFrequency: 'DAILY',
      trackIssueDate: true,
      trackExpirationDate: true,
      trackIssuingAuthority: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditableDocs(prev => [...prev, newDoc]);
    setDocsDirty(true);
  }, []);

  const removeDocInline = useCallback((id: string) => {
    setEditableDocs(prev => prev.filter(d => d.id !== id));
    setDocsDirty(true);
  }, []);

  const updateDocInline = useCallback((id: string, name: string) => {
    setEditableDocs(prev => prev.map(d => d.id === id ? { ...d, name } : d));
    setDocsDirty(true);
  }, []);

  const updateDocFieldType = useCallback((id: string, fieldType: string) => {
    setEditableDocs(prev => prev.map(d => d.id === id ? { ...d, fieldType } : d));
    setDocsDirty(true);
  }, []);

  const updateDocExpirationAlertDays = useCallback((id: string, days: number) => {
    setEditableDocs(prev => prev.map(d => d.id === id ? { ...d, expirationAlertDays: days } : d));
    setDocsDirty(true);
  }, []);

  const updateDocExpirationAlertFrequency = useCallback((id: string, frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY') => {
    setEditableDocs(prev => prev.map(d => d.id === id ? { ...d, expirationAlertFrequency: frequency } : d));
    setDocsDirty(true);
  }, []);

  const handleSaveDocs = useCallback(async () => {
    if (!canCreateSettings) return;
    setSavingDocs(true);
    setPageMsg(null);
    try {
      // Determine what was added, removed, and changed
      const originalIds = new Set(requiredDocuments.map(d => d.id));
      const currentIds = new Set(editableDocs.map(d => d.id));

      // Delete removed docs
      const removedIds = [...originalIds].filter(id => id.startsWith('new-') === false && !currentIds.has(id));
      for (const id of removedIds) {
        await companySettingsService.deleteRequiredDocument(id);
      }

      // Upsert: create new docs, update existing
      for (const doc of editableDocs) {
        if (doc.id.startsWith('new-')) {
          // New doc - create
          await companySettingsService.createRequiredDocument(
            doc.name.trim(),
            doc.documentCategory || 'mandatory',
            undefined,
            undefined,
            doc.fieldType || 'attachment',
            doc.expirationAlertDays ?? 30,
            doc.expirationAlertFrequency || 'DAILY',
            doc.trackIssueDate ?? true,
            doc.trackExpirationDate ?? true,
            doc.trackIssuingAuthority ?? true
          );
        } else {
          // Existing doc - update name, isRequired, fieldType, alertDays, alertFrequency
          const original = requiredDocuments.find(d => d.id === doc.id);
          if (
            original &&
            (original.name !== doc.name.trim() ||
              (original.documentCategory || 'mandatory') !== (doc.documentCategory || 'mandatory') ||
              (original.fieldType || 'attachment') !== (doc.fieldType || 'attachment') ||
              (original.expirationAlertDays ?? 30) !== (doc.expirationAlertDays ?? 30) ||
              (original.expirationAlertFrequency || 'DAILY') !== (doc.expirationAlertFrequency || 'DAILY'))
          ) {
            await companySettingsService.updateRequiredDocument(doc.id, {
              name: doc.name.trim(),
              documentCategory: doc.documentCategory || 'mandatory',
              fieldType: doc.fieldType || 'attachment',
              expirationAlertDays: doc.expirationAlertDays ?? 30,
              expirationAlertFrequency: doc.expirationAlertFrequency || 'DAILY',
              trackIssueDate: doc.trackIssueDate ?? true,
              trackExpirationDate: doc.trackExpirationDate ?? true,
              trackIssuingAuthority: doc.trackIssuingAuthority ?? true,
            });
          }
        }
      }

      setDocsDirty(false);
      setPageMsg('Required documents updated.');
      await reloadRequiredDocuments();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to save documents');
    } finally {
      setSavingDocs(false);
    }
  }, [editableDocs, requiredDocuments, reloadRequiredDocuments]);

  const tabCounts: Record<TabKey, number | undefined> = {
    'general': undefined,
    'branding': undefined,
    'departments': undefined,
    'positions': positions.length,
    'warehouses': warehouses.length,
    'forms': undefined,
    'form-documents': editableDocs.length,
    'email-templates': undefined,
    'documents-contracts': undefined,
    'doc-serialization': undefined,
  };

  // ── Department CRUD ──

  const openAddDept = useCallback(() => {
    setEditingDept(null);
    setDeptName('');
    setDeptDesc('');
    setDeptError(null);
    setShowDeptModal(true);
  }, []);

  const openEditDept = useCallback((dept: Department) => {
    setEditingDept(dept);
    setDeptName(dept.name);
    setDeptDesc(dept.description || '');
    setDeptError(null);
    setShowDeptModal(true);
  }, []);

  const handleSaveDept = useCallback(async () => {
    if (!canCreateSettings) return;
    const trimmed = deptName.trim();
    if (!trimmed) return;
    const exists = departments.some(
      (d) => d.id !== editingDept?.id && d.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setDeptError(`Department "${trimmed}" already exists.`);
      return;
    }
    setActionLoading(true);
    setDeptError(null);
    setPageMsg(null);
    try {
      if (editingDept) {
        await companySettingsService.updateDepartment(editingDept.id, {
          name: trimmed,
          description: deptDesc.trim() || undefined,
        });
        setPageMsg(`Department "${trimmed}" updated.`);
      } else {
        await companySettingsService.createDepartment(trimmed, deptDesc.trim() || undefined);
        setPageMsg(`Department "${trimmed}" created.`);
      }
      setShowDeptModal(false);
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save department';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setDeptError(`Department "${trimmed}" already exists.`);
      } else {
        setDeptError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [editingDept, deptName, deptDesc, departments, reload, canCreateSettings]);

  // ── Category CRUD ──

  const openAddCat = useCallback((deptId?: number) => {
    setEditingCat(null);
    setCatDeptId(String(deptId || (departments[0]?.id || 0)));
    setCatName('');
    setCatDesc('');
    setCatError(null);
    setShowCatModal(true);
  }, [departments]);

  const openEditCat = useCallback((cat: Category) => {
    setEditingCat(cat);
    setCatDeptId(String(cat.departmentId));
    setCatName(cat.name);
    setCatDesc(cat.description || '');
    setCatError(null);
    setShowCatModal(true);
  }, []);

  const handleSaveCat = useCallback(async () => {
    if (!canCreateSettings) return;
    const trimmed = catName.trim();
    if (!trimmed || !catDeptId) return;
    const exists = categories.some(
      (c) => c.id !== editingCat?.id && String(c.departmentId) === String(catDeptId) && c.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setCatError(`Category "${trimmed}" already exists in this department.`);
      return;
    }
    setActionLoading(true);
    setCatError(null);
    setPageMsg(null);
    try {
      if (editingCat) {
        await companySettingsService.updateCategory(editingCat.id, {
          departmentId: String(catDeptId),
          name: trimmed,
          description: catDesc.trim() || undefined,
        });
        setPageMsg(`Category "${trimmed}" updated.`);
      } else {
        await companySettingsService.createCategory(String(catDeptId), trimmed, catDesc.trim() || undefined);
        setPageMsg(`Category "${trimmed}" created.`);
      }
      setShowCatModal(false);
      reload();
      reloadCategories();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save category';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setCatError(`Category "${trimmed}" already exists.`);
      } else {
        setCatError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [editingCat, catDeptId, catName, catDesc, categories, reload, reloadCategories, canCreateSettings]);

  const toggleDeptActive = useCallback(async (dept: Department) => {
    if (!canCreateSettings) return;
    setPageMsg(null);
    try {
      await companySettingsService.updateDepartment(dept.id, { isActive: !dept.isActive });
      setPageMsg(`Department "${dept.name}" ${dept.isActive ? 'deactivated' : 'activated'}.`);
      reload();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to update department');
    }
  }, [reload, canCreateSettings]);

  // ── Payment Term handlers ──

  const openAddPaymentTerm = useCallback(() => {
    setPaymentTermName('');
    setPaymentTermError(null);
    setShowPaymentTermModal(true);
  }, []);

  const handleSavePaymentTerm = useCallback(async () => {
    const trimmed = paymentTermName.trim();
    if (!trimmed) return;
    const exists = paymentTerms.some(
      (pt) => pt.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setPaymentTermError(`Payment term "${trimmed}" already exists.`);
      return;
    }
    setActionLoading(true);
    setPaymentTermError(null);
    setPageMsg(null);
    try {
      await companySettingsService.createPaymentTerm(trimmed);
      setPageMsg(`Payment term "${trimmed}" created.`);
      setShowPaymentTermModal(false);
      reloadPaymentTerms();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save payment term';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setPaymentTermError(`Payment term "${trimmed}" already exists.`);
      } else {
        setPaymentTermError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [paymentTermName, paymentTerms, reloadPaymentTerms]);

  const requestDeletePaymentTerm = useCallback((term: PaymentTerm) => {
    setDeleteTarget({ type: 'paymentTerm', id: term.id, name: term.name });
  }, []);

  // ── Position handlers ──

  const openAddPosition = useCallback(() => {
    setPositionName('');
    setPositionDesc('');
    setPositionError(null);
    setShowPositionModal(true);
  }, []);

  const handleSavePosition = useCallback(async () => {
    const trimmed = positionName.trim();
    if (!trimmed) return;
    const exists = positions.some(
      (pos) => pos.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setPositionError(`Position "${trimmed}" already exists.`);
      return;
    }
    setActionLoading(true);
    setPositionError(null);
    setPageMsg(null);
    try {
      await companySettingsService.createPosition(trimmed, positionDesc.trim() || undefined);
      setPageMsg(`Position "${trimmed}" created.`);
      setShowPositionModal(false);
      reloadPositions();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save position';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setPositionError(`Position "${trimmed}" already exists.`);
      } else {
        setPositionError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [positionName, positionDesc, positions, reloadPositions]);

  const requestDeletePosition = useCallback((position: Position) => {
    if (!canCreateSettings) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Delete Position',
      message: `Are you sure you want to delete position "${position.name}"? This action cannot be undone.`,
      variant: 'danger',
      confirmText: 'Delete Position',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await companySettingsService.deletePosition(position.id);
          setPageMsg(`Position "${position.name}" deleted.`);
          reloadPositions();
        } catch (err) {
          setPageMsg(err instanceof Error ? err.message : 'Failed to delete position');
        } finally {
          setConfirmModalConfig(null);
        }
      },
    });
  }, [canCreateSettings, reloadPositions]);

  const requestDeleteWarehouse = useCallback((wh: Warehouse) => {
    if (!canCreateSettings) return;
    setConfirmModalConfig({
      isOpen: true,
      title: 'Delete Warehouse',
      message: `Are you sure you want to delete warehouse "${wh.code} - ${wh.name}"? This action cannot be undone.`,
      variant: 'danger',
      confirmText: 'Delete Warehouse',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await companySettingsService.deleteWarehouse(wh.id);
          setPageMsg(`Warehouse ${wh.code} deleted.`);
          reloadWarehouses();
        } catch (err) {
          setPageMsg(err instanceof Error ? err.message : 'Failed to delete warehouse');
        } finally {
          setConfirmModalConfig(null);
        }
      },
    });
  }, [canCreateSettings, reloadWarehouses]);

  const openAddUnit = useCallback(() => {
    setUnitName('');
    setSelectedPresetUnit('');
    setUnitError(null);
    setShowUnitModal(true);
  }, []);

  const handleSaveUnit = useCallback(async () => {
    const trimmed = unitName.trim();
    if (!trimmed) return;
    const trimmedLower = trimmed.toLowerCase();

    // 1. Direct name match check
    const nameExists = units.some((u) => u.name.trim().toLowerCase() === trimmedLower);
    if (nameExists) {
      setUnitError(`Unit "${trimmed}" already exists.`);
      return;
    }

    // 2. Synonym & symbol match check (e.g. kg <-> Kilogram)
    const queryGroup = findSynonymGroup(trimmedLower);
    if (queryGroup) {
      const synonymMatch = units.find((u) => {
        const exName = u.name.trim().toLowerCase();
        const exAbbr = u.abbreviation?.trim().toLowerCase();
        return queryGroup.includes(exName) || (exAbbr && queryGroup.includes(exAbbr));
      });
      if (synonymMatch) {
        setUnitError(`"${trimmed}" is equivalent to existing unit "${synonymMatch.name}". Duplicate creation blocked.`);
        return;
      }
    }

    setActionLoading(true);
    setUnitError(null);
    try {
      await companySettingsService.createUnit(trimmed);
      setPageMsg(`Unit "${trimmed}" created.`);
      setShowUnitModal(false);
      reloadUnits();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save unit';
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setUnitError(`Unit "${trimmed}" already exists.`);
      } else {
        setUnitError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  }, [unitName, units, reloadUnits]);

  const requestDeleteUnit = useCallback((unit: Unit) => {
    setDeleteTarget({ type: 'unit', id: unit.id, name: unit.name });
  }, []);

  // ── Delete handlers ──

  // Required document handlers






  const requestDeleteRequiredDoc = useCallback((doc: RequiredDocument) => {
    setDeleteTarget({ type: 'requiredDocument', id: doc.id, name: doc.name });
  }, []);

  const requestDeleteDept = useCallback((dept: Department) => {
    setDeleteTarget({ type: 'department', id: dept.id, name: dept.name });
  }, []);

  const requestDeleteCat = useCallback((cat: Category) => {
    setDeleteTarget({ type: 'category', id: cat.id, name: cat.name });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!canCreateSettings || !deleteTarget) return;
    setDeleting(true);
    setPageMsg(null);
    try {
      if (deleteTarget.type === 'department') {
        await companySettingsService.deleteDepartment(deleteTarget.id);
        setPageMsg(`Department "${deleteTarget.name}" deleted.`);
        reload();
      } else if (deleteTarget.type === 'category') {
        await companySettingsService.deleteCategory(deleteTarget.id);
        setPageMsg(`Category "${deleteTarget.name}" deleted.`);
        reloadCategories();
      } else if (deleteTarget.type === 'unit') {
        await companySettingsService.deleteUnit(deleteTarget.id);
        setPageMsg(`Unit "${deleteTarget.name}" deleted.`);
        reloadUnits();
      } else if (deleteTarget.type === 'paymentTerm') {
        await companySettingsService.deletePaymentTerm(deleteTarget.id);
        setPageMsg(`Payment term "${deleteTarget.name}" deleted.`);
        reloadPaymentTerms();
      } else if (deleteTarget.type === 'position') {
        await companySettingsService.deletePosition(deleteTarget.id);
        setPageMsg(`Position "${deleteTarget.name}" deleted.`);
        reloadPositions();
      } else if (deleteTarget.type === 'requiredDocument') {
        await companySettingsService.deleteRequiredDocument(deleteTarget.id);
        setPageMsg(`Required document "${deleteTarget.name}" deleted.`);
        reloadRequiredDocuments();
      }
      setDeleteTarget(null);
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, reload, reloadCategories, reloadUnits, reloadPaymentTerms, reloadPositions, reloadRequiredDocuments, canCreateSettings]);

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const toggleCatActive = useCallback(async (cat: Category) => {
    setPageMsg(null);
    try {
      await companySettingsService.updateCategory(cat.id, { isActive: !cat.isActive });
      setPageMsg(`Category "${cat.name}" ${cat.isActive ? 'deactivated' : 'activated'}.`);
      reloadCategories();
    } catch (err) {
      setPageMsg(err instanceof Error ? err.message : 'Failed to update category');
    }
  }, [reloadCategories]);

  // -----------------------------------------------------------
  //  RENDER
  // -----------------------------------------------------------

  // ── Render Documents Tab (extracted for Oxc compatibility) ──
  


  // ── Early Return for Passcode Protection Gate ──
  if (checkingPasscodeStatus && !isUnlocked) {
    return (
      <div className="cs-lock-overlay">
        <div className="cs-lock-card">
          <div className="cs-lock-badge">
            <Lock size={34} />
          </div>
          <h2 className="cs-lock-title">Verifying Access...</h2>
          <p className="cs-lock-subtitle">
            Checking security settings for Company Settings...
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary-400, #38bdf8)' }} />
          </div>
        </div>
      </div>
    );
  }

  if (isPasscodeProtected && !isUnlocked) {
    return (
      <div className="cs-lock-overlay">
        <div className="cs-lock-card">
          <div className="cs-lock-badge">
            <Lock size={34} />
          </div>

          <h2 className="cs-lock-title">
            Company Settings Security Lock
          </h2>
          <p className="cs-lock-subtitle">
            Access to Company Settings is passcode protected by Super Admin. Please enter your passcode to unlock.
          </p>

          {lockError && (
            <div style={{ marginBottom: 18, textAlign: 'left' }}>
              <MessageStrip type="error" compact>
                {lockError}
              </MessageStrip>
            </div>
          )}

          <form onSubmit={handleUnlock} className="cs-lock-form">
            <div className="cs-passcode-input-group">
              <label className="cs-passcode-label" htmlFor="settings-lock-passcode">
                Security Passcode <span className="cs-passcode-label__req">*</span>
              </label>
              <div className="cs-passcode-input-wrapper">
                <input
                  id="settings-lock-passcode"
                  type={showPasscodeText ? 'text' : 'password'}
                  className="cs-passcode-input"
                  placeholder="Enter passcode"
                  value={lockPasscode}
                  onChange={(e) => setLockPasscode(e.target.value)}
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className="cs-passcode-toggle-btn"
                  onClick={() => setShowPasscodeText(!showPasscodeText)}
                  tabIndex={-1}
                >
                  {showPasscodeText ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="cs-lock-submit-btn"
              disabled={verifyingLock || !lockPasscode.trim()}
            >
              {verifyingLock ? (
                <span>Verifying Passcode…</span>
              ) : (
                <>
                  <Key size={18} />
                  <span>Unlock Company Settings</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`company-settings-page ${!canCreateSettings ? 'is-view-only' : ''}`}>
      {pageMsg && (
        <MessageStrip
          type={inferMessageType(pageMsg)}
          onClose={() => setPageMsg(null)}
          autoHideMs={5000}
          className="sap-message-strip--toast"
        >
          {typeof pageMsg === 'string' ? pageMsg : (typeof pageMsg === 'object' && pageMsg !== null) ? JSON.stringify(pageMsg) : String(pageMsg)}
        </MessageStrip>
      )}
      {loading && <div className="company-settings-page__loading" />}

      {/* ── Page Header ── */}
      <div className="cs-page-header">
        <h1><Settings size={22} /> Company Settings</h1>
        <p>Configure your organization's departments, categories, units, and payment terms</p>
      </div>



      {/* ── Tab Bar ── */}
      <div className="cs-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`cs-tab ${activeTab === tab.key ? 'cs-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* -------------------------------------------------------
          TAB: General
          ------------------------------------------------------- */}
      {activeTab === 'general' && (
        <div className="cs-tab-panel" role="tabpanel">
          {/* ── Company Settings Passcode Security ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Lock size={17} /> Company Settings Access Passcode</h2>
                <p>Restrict access to the Company Settings tab with a security passcode. Anyone visiting this tab will be prompted for the passcode.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: isPasscodeProtected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                    border: isPasscodeProtected ? '1px solid #10b981' : '1px solid #f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isPasscodeProtected ? '#10b981' : '#f59e0b',
                  }}>
                    {isPasscodeProtected ? <ShieldCheck size={22} /> : <Lock size={22} />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      Status: {isPasscodeProtected ? 'Passcode Protection Active 🔒' : 'Passcode Not Set (Open Access)'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {isPasscodeProtected
                        ? 'Company Settings is secured. Unlocked for your current session.'
                        : 'Set a security passcode to lock Company Settings tab from unauthorized access.'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  {isPasscodeProtected ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setPasscodeModalMode('change');
                          setPasscodeError(null);
                          setPasscodeCurrent('');
                          setPasscodeNew('');
                          setPasscodeConfirm('');
                          setShowPasscodeModal(true);
                        }}
                        style={{
                          padding: '9px 16px',
                          borderRadius: 6,
                          border: '1px solid var(--primary-500, #0a6ed1)',
                          background: 'rgba(10, 110, 209, 0.1)',
                          color: 'var(--primary-500, #0a6ed1)',
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Key size={15} />
                        Change Passcode
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPasscodeModalMode('remove');
                          setPasscodeError(null);
                          setPasscodeCurrent('');
                          setShowPasscodeModal(true);
                        }}
                        style={{
                          padding: '9px 16px',
                          borderRadius: 6,
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#ef4444',
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Unlock size={15} />
                        Disable Passcode
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPasscodeModalMode('set');
                        setPasscodeError(null);
                        setPasscodeCurrent('');
                        setPasscodeNew('');
                        setPasscodeConfirm('');
                        setShowPasscodeModal(true);
                      }}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 6,
                        border: 'none',
                        background: 'var(--primary-500, #0a6ed1)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      <Lock size={15} />
                      Set Security Passcode
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><DollarSign size={17} /> Default Currency</h2>
                <p>Set the default currency used throughout the application for RFQs, quotations, invoices, and payments.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="cs-currency-row">
                <CurrencySelector
                  value={displayCurrency}
                  onChange={handleCurrencySelect}
                  size="md"
                />
              </div>
            </div>
          </div>

          {/* ── System Language & Localization ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Globe size={17} /> {t('settings.language_title', 'Language & Localization / Langue du Système')}</h2>
                <p>{t('settings.language_desc', 'Select your preferred interface language across the entire Heliflow portal (English / Français 🇫🇷).')}</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="cs-language-selector-grid" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`cs-lang-card ${language === 'en' ? 'cs-lang-card--active' : ''}`}
                  onClick={() => {
                    setLanguage('en');
                    setLangMsg('System language set to English 🇺🇸');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 20px',
                    borderRadius: 8,
                    border: language === 'en' ? '2px solid var(--primary-500, #0a6ed1)' : '1px solid var(--border)',
                    background: language === 'en' ? 'rgba(10, 110, 209, 0.08)' : 'var(--surface-card)',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 15,
                    color: 'var(--text-primary)',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: 25 }}>🇺🇸</span>
                  <div style={{ textAlign: 'left' }}>
                    <div>English</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Default System Language</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`cs-lang-card ${language === 'fr' ? 'cs-lang-card--active' : ''}`}
                  onClick={() => {
                    setLanguage('fr');
                    setLangMsg('Langue du système changée en Français 🇫🇷');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 20px',
                    borderRadius: 8,
                    border: language === 'fr' ? '2px solid var(--primary-500, #0a6ed1)' : '1px solid var(--border)',
                    background: language === 'fr' ? 'rgba(10, 110, 209, 0.08)' : 'var(--surface-card)',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 15,
                    color: 'var(--text-primary)',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: 25 }}>🇫🇷</span>
                  <div style={{ textAlign: 'left' }}>
                    <div>Français</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Langue Française</div>
                  </div>
                </button>
              </div>

              {langMsg && (
                <div style={{ marginTop: 12 }}>
                  <MessageStrip type="success" compact onClose={() => setLangMsg(null)}>
                    {langMsg}
                  </MessageStrip>
                </div>
              )}
            </div>
          </div>

          {/* ── Portal Name ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Settings size={17} /> Portal Name</h2>
                <p>Set the display name for the internal employee portal. This appears on the login page and in branding.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="company-settings__field">
                <label>Primary Portal Name</label>
                <input
                  value={pendingPortalName !== null ? pendingPortalName : portalName}
                  onChange={(e) => setPendingPortalName(e.target.value)}
                  placeholder="e.g. Employee"
                  className={pendingPortalName !== null && pendingPortalName !== portalName ? 'cs-input--changed' : ''}
                />
                <span className="cs-field-hint">
                  Shown on the employee login page (e.g. "Employee Sign In"). Default: "Employee".
                  The vendor portal name is fixed as "Vendor".
                </span>
              </div>
            </div>
          </div>
          {/* ── User Limit Configuration ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Users size={17} /> Company Active Users Quota</h2>
                <p>View your organization's maximum active user seat limit allocated by your service provider (Procnex).</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: '8px',
                background: 'var(--surface-hover)',
                border: '1px solid var(--border)',
                flexWrap: 'wrap',
                gap: 16
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Current User Seat Limit: <span style={{ color: 'var(--primary-500)', fontSize: 19, fontWeight: 800 }}>{profile?.maxUsers ?? 50} Active Users</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Managed by Platform Provider (Procnex). User creation is blocked when this limit is reached.
                  </div>
                </div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  background: 'var(--surface-card)',
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px dashed var(--border)'
                }}>
                  📞 Need more user seats? Contact Procnex Support to upgrade.
                </div>
              </div>
            </div>
          </div>

          {/* ── Time Limits ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Clock size={17} /> Vendor Time Limits</h2>
                <p>Configure time-based rules for vendor onboarding and resubmission. Expired vendors are automatically cleaned up by the scheduler.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="cs-time-limits-grid">
                <div className="cs-time-limit-field">
                  <label>Invitation Expiry (hours)</label>
                  <div className="cs-time-limit-input-wrap">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={pendingInvitationExpiry !== null ? pendingInvitationExpiry : invitationExpiryHours}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, '');
                        if (cleaned === '') {
                          setPendingInvitationExpiry(0);
                        } else {
                          setPendingInvitationExpiry(Math.max(1, Math.min(8760, Number(cleaned))));
                        }
                      }}
                      className={pendingInvitationExpiry !== null && pendingInvitationExpiry !== invitationExpiryHours ? 'cs-input--changed' : ''}
                    />
                    <span className="cs-time-limit-hint">
                      {(pendingInvitationExpiry !== null ? pendingInvitationExpiry : invitationExpiryHours) >= 24
                        ? `≈ ${Math.round((pendingInvitationExpiry !== null ? pendingInvitationExpiry : invitationExpiryHours) / 24)} days`
                        : '< 1 day'}
                    </span>
                  </div>
                  <p className="cs-time-limit-desc">
                    How long a vendor has to accept their onboarding invitation before being automatically deleted. Default: 168 hours (7 days).
                  </p>
                </div>
                <div className="cs-time-limit-field">
                  <label>Resubmission Deadline (hours)</label>
                  <div className="cs-time-limit-input-wrap">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={pendingResubmissionDeadline !== null ? pendingResubmissionDeadline : resubmissionDeadlineHours}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, '');
                        if (cleaned === '') {
                          setPendingResubmissionDeadline(0);
                        } else {
                          setPendingResubmissionDeadline(Math.max(1, Math.min(8760, Number(cleaned))));
                        }
                      }}
                      className={pendingResubmissionDeadline !== null && pendingResubmissionDeadline !== resubmissionDeadlineHours ? 'cs-input--changed' : ''}
                    />
                    <span className="cs-time-limit-hint">
                      {(pendingResubmissionDeadline !== null ? pendingResubmissionDeadline : resubmissionDeadlineHours) >= 24
                        ? `≈ ${Math.round((pendingResubmissionDeadline !== null ? pendingResubmissionDeadline : resubmissionDeadlineHours) / 24)} days`
                        : '< 1 day'}
                    </span>
                  </div>
                  <p className="cs-time-limit-desc">
                    How long a rejected vendor has to correct their information and resubmit before being automatically deleted. Default: 72 hours (3 days).
                  </p>
                </div>
              </div>

              {(hasPendingChange || hasTimeLimitChanges || hasPortalNameChange) && (
                <div className="cs-time-limit-actions">
                  <button
                    className="company-settings__btn company-settings__btn--primary"
                    onClick={handleSaveGeneralSettings}
                    disabled={savingCurrency}
                  >
                    <Save size={16} /> {savingCurrency ? 'Saving…' : 'Save All Changes'}
                  </button>
                  <button
                    className="company-settings__btn company-settings__btn--secondary"
                    onClick={handleCurrencyCancel}
                  >
                    <X size={16} /> Discard Changes
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Payment Terms ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><CreditCard size={17} /> Payment Terms</h2>
                <p>Manage payment term options for vendor quotations (e.g. Net 15, Net 30, Net 45, Advance)</p>
              </div>
              <div className="cs-section-header__actions">
                <button className="company-settings__btn company-settings__btn--primary" onClick={openAddPaymentTerm}>
                  <Plus size={16} /> Add Payment Term
                </button>
              </div>
            </div>
            <div className="cs-section-body">
              {paymentTerms.length === 0 ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><CreditCard size={28} /></div>
                  <p>No payment terms yet. Add your first payment term to get started.</p>
                  <button className="company-settings__btn company-settings__btn--primary" onClick={openAddPaymentTerm}>
                    <Plus size={16} /> Add Payment Term
                  </button>
                </div>
              ) : (
                <div className="cs-item-list">
                  {paymentTerms.map((term) => (
                    <div key={term.id} className={`cs-item ${!term.isActive ? 'cs-item--inactive' : ''}`}>
                      <div className="cs-item__info">
                        <span className="cs-item__name">{term.name}</span>
                      </div>
                      <div className="cs-item__actions">
                        <span className={`company-settings__badge company-settings__badge--sm ${term.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}>
                          {term.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button className="company-settings__icon-btn company-settings__icon-btn--danger" onClick={() => requestDeletePaymentTerm(term)} title="Delete payment term">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Units of Measure ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Ruler size={17} /> Units of Measure</h2>
                <p>Manage units used for line items in RFQs (e.g. Pcs, Kg, Ltr, Mtr)</p>
              </div>
              <div className="cs-section-header__actions">
                <button className="company-settings__btn company-settings__btn--primary" onClick={openAddUnit}>
                  <Plus size={16} /> Add Unit
                </button>
              </div>
            </div>
            <div className="cs-section-body">
              {units.length === 0 ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><Ruler size={28} /></div>
                  <p>No units yet. Add your first unit to get started.</p>
                  <button className="company-settings__btn company-settings__btn--primary" onClick={openAddUnit}>
                    <Plus size={16} /> Add Unit
                  </button>
                </div>
              ) : (
                <div className="cs-item-list">
                  {units.map((unit) => (
                    <div key={unit.id} className={`cs-item ${!unit.isActive ? 'cs-item--inactive' : ''}`}>
                      <div className="cs-item__info">
                        <span className="cs-item__name">{unit.name}</span>
                        {unit.abbreviation && (
                          <span className="cs-item__unit-abbr" title="Abbreviation / Symbol">{unit.abbreviation}</span>
                        )}
                        {unit.aliases && <span className="cs-item__aliases">{unit.aliases}</span>}
                      </div>
                      <div className="cs-item__actions">
                        <span className={`company-settings__badge company-settings__badge--sm ${unit.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}>
                          {unit.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button className="company-settings__icon-btn company-settings__icon-btn--danger" onClick={() => requestDeleteUnit(unit)} title="Delete unit">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}                    </div>

                  )}

            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Branding / White Label
          ------------------------------------------------------- */}
      {activeTab === 'branding' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Palette size={17} /> White Label Branding</h2>
                <p>Customize the platform appearance for your clients - logo, colors, company name, and more. Changes apply immediately.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="cs-branding-form">
                {/* Company Name */}
                <div className="company-settings__field">
                  <label>Company Name</label>
                  <input
                    value={brandingName}
                    onChange={(e) => { setBrandingName(e.target.value); markBrandingDirty(); }}
                    placeholder="e.g. Acme Corp"
                  />
                  <span className="cs-field-hint">Used throughout the app - sidebar, login page, browser title, and emails</span>
                </div>

                {/* Primary Color */}
                <div className="company-settings__field">
                  <label>Primary Color</label>
                  <div className="cs-color-row">
                    <input
                      type="color"
                      value={brandingColor}
                      onChange={(e) => { setBrandingColor(e.target.value); markBrandingDirty(); }}
                      className="cs-color-picker"
                    />
                    <input
                      type="text"
                      value={brandingColor}
                      onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) { setBrandingColor(v); markBrandingDirty(); } }}
                      placeholder="#0a6ed1"
                      className="cs-color-hex"
                      maxLength={7}
                    />
                    <button
                      type="button"
                      className="cs-color-reset-btn"
                      onClick={() => { setBrandingColor('#0a6ed1'); markBrandingDirty(); }}
                      title="Reset to default color"
                    >
                      <RotateCcw size={14} /> Reset
                    </button>
                  </div>
                  <span className="cs-field-hint">Applied to buttons, links, highlights, and sidebar accent. Default: #0a6ed1</span>
                </div>

                {/* Logo Upload */}
                <div className="company-settings__field">
                  <label>Logo</label>
                  <div className="cs-upload-row">
                    {brandingLogoUrl && (
                      <div className="cs-logo-preview cs-logo-preview--uploaded">
                        <img src={brandingLogoUrl} alt="Logo" className="cs-logo-preview__img" />
                      </div>
                    )}
                    <label
                      className="cs-upload-btn"
                      style={!canCreateSettings ? { opacity: 0.6, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                      title={!canCreateSettings ? noPermissionTitle : undefined}
                      onClick={(e) => {
                        if (!canCreateSettings) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                        onChange={(e) => {
                          if (!canCreateSettings) return;
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setCropType('logo');
                          setCropFile(file);
                          e.target.value = '';
                        }}
                        disabled={!canCreateSettings}
                        style={{ display: 'none' }}
                        id="logo-upload-input"
                      />
                      <span className="cs-upload-btn__label">
                        <Image size={16} />
                        {uploadingLogo ? 'Uploading…' : 'Choose Logo'}
                      </span>
                    </label>
                    {brandingLogoUrl && (
                      <button
                        className="company-settings__icon-btn company-settings__icon-btn--danger"
                        disabled={!canCreateSettings}
                        style={!canCreateSettings ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                        onClick={async () => {
                          if (!canCreateSettings) return;
                          try {
                            setRemovingLogo(true);
                            const updated = await companySettingsService.updateCompanyProfile({ logoUrl: '', faviconUrl: '' });
                            setBrandingLogoUrl('');
                            setBrandingFaviconUrl('');
                            setProfile(updated);
                            setPageMsg('Logo removed');
                            const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
                            if (link) link.href = '/favicon.png';
                            refreshBranding();
                          } catch (err) {
                            setPageMsg(err instanceof Error ? err.message : 'Failed to remove logo');
                          } finally {
                            setRemovingLogo(false);
                          }
                        }}
                        title={!canCreateSettings ? noPermissionTitle : "Remove logo"}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <span className="cs-field-hint">Recommended: 200×60px PNG with transparent background. Max 2MB. (This logo will also be used as the website favicon)</span>
                </div>

                {/* Login Text */}
                <div className="company-settings__field">
                  <label>Login Page Text</label>
                  <input
                    value={brandingLoginText}
                    onChange={(e) => { setBrandingLoginText(e.target.value); markBrandingDirty(); }}
                    placeholder="Digital Procurement & RFQ Workflow Platform"
                  />
                  <span className="cs-field-hint">Subtitle shown on the login page below the company name</span>
                </div>

                {/* Support Email */}
                <div className="company-settings__field">
                  <label>Support Email</label>
                  <input
                    type="email"
                    value={brandingSupportEmail}
                    onChange={(e) => { setBrandingSupportEmail(e.target.value); markBrandingDirty(); }}
                    placeholder="support@example.com"
                  />
                  <span className="cs-field-hint">Shown in the app footer and login page footer</span>
                </div>

                {/* Company Phone */}
                <div className="company-settings__field">
                  <label>Company Phone</label>
                  <input
                    type="tel"
                    value={brandingCompanyPhone}
                    onChange={(e) => { setBrandingCompanyPhone(e.target.value); markBrandingDirty(); }}
                    placeholder="+91 1234567890"
                  />
                  <span className="cs-field-hint">Shown on Purchase Order documents and contract templates</span>
                </div>

                {/* Company Email */}
                <div className="company-settings__field">
                  <label>Company Email</label>
                  <input
                    type="email"
                    value={brandingCompanyEmail}
                    onChange={(e) => { setBrandingCompanyEmail(e.target.value); markBrandingDirty(); }}
                    placeholder="info@example.com"
                  />
                  <span className="cs-field-hint">Shown on Purchase Order documents and contract templates</span>
                </div>

                {/* Save Button */}
                {brandingDirty && (
                  <div className="cs-branding-actions">
                    <button
                      className="company-settings__btn company-settings__btn--primary"
                      onClick={handleSaveBranding}
                      disabled={savingBranding}
                    >
                      <Save size={16} /> {savingBranding ? 'Saving…' : 'Save Branding'}
                    </button>
                    <button
                      className="company-settings__btn company-settings__btn--secondary"
                      onClick={() => {
                        brandingInitialized.current = false;
                        setBrandingDirty(false);
                        if (profile) {
                          setBrandingName(profile.companyName || '');
                          setBrandingLogoUrl(profile.logoUrl || '');
                          setBrandingFaviconUrl(profile.faviconUrl || '');
                          setBrandingColor(profile.primaryColor || '#0a6ed1');
                          setBrandingLoginText(profile.loginText || '');
                          setBrandingSupportEmail(profile.supportEmail || '');
                        }
                      }}
                    >
                      <X size={16} /> Discard
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Departments & Categories
          ------------------------------------------------------- */}
      {activeTab === 'departments' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Building2 size={17} /> Departments & Categories</h2>
                <p>Manage procurement departments and their vendor categories</p>
              </div>
              <div className="cs-section-header__actions">
                <button className="company-settings__btn company-settings__btn--primary" onClick={() => openAddCat()}>
                  <Plus size={16} /> Add Category
                </button>
                <button className="company-settings__btn company-settings__btn--primary" onClick={openAddDept}>
                  <Plus size={16} /> Add Department
                </button>
              </div>
            </div>
            <div className="cs-section-body">
              {/* Search */}
              <div className="cs-dept-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search departments..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Department & Category Tree */}
              {filtered.length === 0 ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><Building2 size={28} /></div>
                  <p>No departments found. Add your first department to get started.</p>
                  <button className="company-settings__btn company-settings__btn--primary" onClick={openAddDept}>
                    <Plus size={16} /> Add Department
                  </button>
                </div>
              ) : (
                <div className="cs-dept-list">
                  {filtered.map((dept) => {
                    const deptCats = categoriesByDept.get(dept.id) || [];
                    const isExpanded = expandedDept.has(dept.id);
                    return (
                      <div key={dept.id} className={`cs-dept ${!dept.isActive ? 'cs-dept--inactive' : ''}`}>
                        {/* Department Row */}
                        <div className="cs-dept__row">
                          <button className="cs-dept__expand" onClick={() => toggleExpand(dept.id)}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          <Building2 size={18} className="cs-dept__icon" />
                          <div className="cs-dept__info">
                            <span className="cs-dept__name">{dept.name}</span>
                            {dept.description && <span className="cs-dept__desc">{dept.description}</span>}
                          </div>
                          <span className="cs-dept__count">{deptCats.length} categories</span>
                          <div className="cs-dept__actions">
                            <button
                              className={`company-settings__badge ${dept.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}
                              onClick={() => toggleDeptActive(dept)}
                              title={dept.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {dept.isActive ? 'Active' : 'Inactive'}
                            </button>
                            <button className="company-settings__icon-btn" onClick={() => { openAddCat(dept.id); }} title="Add category to this department">
                              <Plus size={14} />
                            </button>
                            <button className="company-settings__icon-btn" onClick={() => openEditDept(dept)} title="Edit department">
                              <Edit3 size={14} />
                            </button>
                            <button className="company-settings__icon-btn company-settings__icon-btn--danger" onClick={() => requestDeleteDept(dept)} title="Delete department">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Categories for this department */}
                        {isExpanded && (
                          <div className="cs-cats">
                            {deptCats.length === 0 ? (
                              <div className="cs-cats__empty">
                                <Tag size={14} /> No categories yet. Click <Plus size={12} /> to add one.
                              </div>
                            ) : (
                              deptCats.map((cat) => (
                                <div key={cat.id} className={`cs-cat ${!cat.isActive ? 'cs-cat--inactive' : ''}`}>
                                  <Tag size={14} className="cs-cat__icon" />
                                  <span className="cs-cat__name">{cat.name}</span>
                                  {cat.description && <span className="cs-cat__desc">{cat.description}</span>}
                                  <div className="cs-cat__actions">
                                    <button
                                      className={`company-settings__badge company-settings__badge--sm ${cat.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}
                                      onClick={() => toggleCatActive(cat)}
                                      title={cat.isActive ? 'Deactivate' : 'Activate'}
                                    >
                                      {cat.isActive ? 'Active' : 'Inactive'}
                                    </button>
                                    <button className="company-settings__icon-btn" onClick={() => openEditCat(cat)} title="Edit category">
                                      <Edit3 size={13} />
                                    </button>
                                    <button className="company-settings__icon-btn company-settings__icon-btn--danger" onClick={() => requestDeleteCat(cat)} title="Delete category">
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        </div>
                      )}
                  )}
                          </div>

                  )}

            </div>
          </div>
        </div>
      )}



      {/* -------------------------------------------------------
          TAB: Warehouses (SRM Logistics & Ship-To Locations)
          ------------------------------------------------------- */}
      {/* ── Branches Tab ── */}
      {activeTab === 'branches' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><MapPin size={17} /> Branch Master (Company Branches &amp; Offices)</h2>
                <p>Manage office locations, regional branches, and assign Branch Managers for user tagging &amp; transaction tracking.</p>
              </div>
              <div className="cs-section-header__actions">
                <button
                  className="company-settings__btn company-settings__btn--primary"
                  onClick={() => openBranchModal(null)}
                  disabled={!canCreateSettings}
                  style={disabledActionStyle}
                  title={canCreateSettings ? undefined : noPermissionTitle}
                >
                  <Plus size={16} /> Add Branch
                </button>
              </div>
            </div>
            <div className="cs-section-body">
              {/* Search Bar */}
              <div className="cs-wh-toolbar">
                <div className="cs-wh-search" style={{ flex: 1 }}>
                  <Search size={15} />
                  <input
                    type="text"
                    placeholder="Search by Code, Branch Name, City, Address or Manager..."
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                  />
                  {branchSearch && (
                    <button className="cs-wh-clear" onClick={() => setBranchSearch('')}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {filteredBranches.length === 0 ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><MapPin size={28} /></div>
                  <p>{branches.length === 0 ? 'No company branches defined yet. Add your first branch location.' : 'No matching branches found.'}</p>
                  {branches.length === 0 && (
                    <button
                      className="company-settings__btn company-settings__btn--primary"
                      onClick={() => openBranchModal(null)}
                      disabled={!canCreateSettings}
                      style={disabledActionStyle}
                      title={canCreateSettings ? undefined : noPermissionTitle}
                    >
                      <Plus size={16} /> Add Branch
                    </button>
                  )}
                </div>
              ) : (
                <div className="cs-wh-table-wrap">
                  <table className="cs-wh-table">
                    <thead>
                      <tr>
                        <th>Branch Code</th>
                        <th>Branch Name</th>
                        <th>City / Address</th>
                        <th>Branch Manager</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBranches.map((br) => (
                        <tr key={br.id} className={!br.isActive ? 'cs-wh-tr--inactive' : ''}>
                          <td>
                            <span className="cs-wh-code-badge" style={{ background: 'var(--primary-100)', color: 'var(--primary-700)' }}>
                              {br.code}
                            </span>
                          </td>
                          <td>
                            <div className="cs-wh-name-cell">
                              <span className="cs-wh-title" style={{ fontWeight: 600 }}>{br.name}</span>
                            </div>
                          </td>
                          <td>
                            <div className="cs-wh-sub-text">
                              {br.address ? `${br.address}${br.city ? `, ${br.city}` : ''}` : (br.city || '—')}
                            </div>
                          </td>
                          <td>
                            <div className="cs-wh-contact-cell">
                              {br.manager ? (
                                <span className="cs-wh-contact-name">{br.manager.fullName} ({br.manager.email})</span>
                              ) : br.managerName ? (
                                <span className="cs-wh-contact-name">{br.managerName}</span>
                              ) : (
                                <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Unassigned</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`company-settings__badge company-settings__badge--sm ${br.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}>
                              {br.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="cs-wh-actions">
                              <button
                                className="company-settings__icon-btn"
                                onClick={() => openBranchModal(br)}
                                title="Edit Branch"
                                disabled={!canCreateSettings}
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                className="company-settings__icon-btn company-settings__icon-btn--danger"
                                onClick={() => handleDeleteBranch(br.id)}
                                title="Delete Branch"
                                disabled={!canCreateSettings}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'warehouses' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Building2 size={17} /> Warehouse Master (Shipping &amp; Receiving Locations)</h2>
                <p>Manage central warehouses, regional hubs, site stores, and ship-to locations for PRs, POs, and GRNs.</p>
              </div>
              <div className="cs-section-header__actions">
                <button
                  className="company-settings__btn company-settings__btn--primary"
                  onClick={() => openWarehouseModal(null)}
                  disabled={!canCreateSettings}
                  style={disabledActionStyle}
                  title={canCreateSettings ? undefined : noPermissionTitle}
                >
                  <Plus size={16} /> Add Warehouse
                </button>
              </div>
            </div>
            <div className="cs-section-body">
              {/* Filter & Search Bar */}
              <div className="cs-wh-toolbar">
                <div className="cs-wh-search">
                  <Search size={15} />
                  <input
                    type="text"
                    placeholder="Search by Code, Name, Address, City or Manager..."
                    value={warehouseSearch}
                    onChange={(e) => setWarehouseSearch(e.target.value)}
                  />
                  {warehouseSearch && (
                    <button className="cs-wh-clear" onClick={() => setWarehouseSearch('')}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="cs-wh-filters">
                  <select
                    value={warehouseTypeFilter}
                    onChange={(e) => setWarehouseTypeFilter(e.target.value)}
                    className="cs-wh-select"
                  >
                    <option value="ALL">All Types</option>
                    <option value="Central Warehouse">Central Warehouse</option>
                    <option value="Regional Hub">Regional Hub</option>
                    <option value="Site Store">Site Store</option>
                    <option value="Transit Center">Transit Center</option>
                  </select>
                </div>
              </div>

              {filteredWarehouses.length === 0 ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><Building2 size={28} /></div>
                  <p>{warehouses.length === 0 ? 'No warehouses defined yet. Add your first warehouse location.' : 'No matching warehouses found.'}</p>
                  {warehouses.length === 0 && (
                    <button
                      className="company-settings__btn company-settings__btn--primary"
                      onClick={() => openWarehouseModal(null)}
                      disabled={!canCreateSettings}
                      style={disabledActionStyle}
                      title={canCreateSettings ? undefined : noPermissionTitle}
                    >
                      <Plus size={16} /> Add Warehouse
                    </button>
                  )}
                </div>
              ) : (
                <div className="cs-wh-table-wrap">
                  <table className="cs-wh-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name &amp; Type</th>
                        <th>Address / City</th>
                        <th>Manager / Contact</th>
                        <th>Ship-To Default</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWarehouses.map((wh) => (
                        <tr key={wh.id} className={!wh.isActive ? 'cs-wh-tr--inactive' : ''}>
                          <td>
                            <span className="cs-wh-code-badge">{wh.code}</span>
                          </td>
                          <td>
                            <div className="cs-wh-name-cell">
                              <span className="cs-wh-title">{wh.name}</span>
                              <span className="cs-wh-type">{wh.type}</span>
                            </div>
                          </td>
                          <td>
                            <div className="cs-wh-sub-text">
                              {wh.address ? `${wh.address}${wh.city ? `, ${wh.city}` : ''}` : (wh.city || '—')}
                              {wh.country && <span className="cs-wh-country"> ({wh.country})</span>}
                            </div>
                          </td>
                          <td>
                            <div className="cs-wh-contact-cell">
                              {wh.contactPerson && <span className="cs-wh-contact-name">{wh.contactPerson}</span>}
                              {wh.phone && <span className="cs-wh-contact-sub"><Phone size={12} /> {wh.phone}</span>}
                              {wh.email && <span className="cs-wh-contact-sub"><Mail size={12} /> {wh.email}</span>}
                              {!wh.contactPerson && !wh.phone && !wh.email && '—'}
                            </div>
                          </td>
                          <td>
                            {wh.isDefault ? (
                              <span className="cs-wh-badge cs-wh-badge--default">
                                <CheckCircle2 size={12} /> Default Ship-To
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="cs-wh-btn-text"
                                onClick={() => handleSetDefaultWarehouse(wh.id)}
                                disabled={!canCreateSettings}
                                style={disabledActionStyle}
                              >
                                Set Default
                              </button>
                            )}
                          </td>
                          <td>
                            <span className={`company-settings__badge company-settings__badge--sm ${wh.isActive ? 'company-settings__badge--active' : 'company-settings__badge--inactive'}`}>
                              {wh.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="cs-wh-actions">
                              <button
                                className="company-settings__icon-btn"
                                onClick={() => openWarehouseModal(wh)}
                                title="Edit Warehouse"
                                disabled={!canCreateSettings}
                                style={disabledActionStyle}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                className="company-settings__icon-btn company-settings__icon-btn--danger"
                                onClick={() => requestDeleteWarehouse(wh)}
                                title="Delete Warehouse"
                                disabled={!canCreateSettings}
                                style={disabledActionStyle}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Forms Settings
          ------------------------------------------------------- */}
      {activeTab === 'forms' && (
        <div className="cs-tab-panel cs-mandatory-section" role="tabpanel">
          {/* ── Form Selector ── */}
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><FileText size={17} /> Forms Settings</h2>
                <p>Select a form below to configure its custom flexi fields and settings.</p>
              </div>
            </div>
            <div className="cs-section-body">
              <div className="cs-form-selector" style={{ marginBottom: 24 }}>
                <select
                  className="cs-form-select"
                  value={selectedFormKey || ''}
                  onChange={(e) => {
                    if (e.target.value) handleSelectForm(e.target.value);
                  }}
                >
                  <option value="" disabled>- Select a form -</option>
                  {AVAILABLE_FORMS.map(form => (
                    <option key={form.key} value={form.key}>{form.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="cs-form-selector__arrow" />
              </div>

              {!selectedFormKey ? (
                <div className="cs-empty">
                  <div className="cs-empty__icon"><FileText size={28} /></div>
                  <p>Select a form above to configure its flexi fields.</p>
                </div>
              ) : (
                <div className="cs-flexi-fields-section" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ padding: 16, border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, background: 'var(--surface-elevated, #f8fafc)' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary, #1e293b)' }}>
                      Add New Custom Flexi Field for {AVAILABLE_FORMS.find(f => f.key === selectedFormKey)?.label}
                    </h3>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)', marginBottom: 14 }}>
                      Pre-define new custom fields here so users on transaction screens can select and add them on demand.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                      <div className="company-settings__field" style={{ flex: '1 1 200px' }}>
                        <label>Field Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Emergency Contact / Project Code"
                          value={newFieldName}
                          onChange={(e) => setNewFieldName(e.target.value)}
                        />
                      </div>
                      <div className="company-settings__field" style={{ width: 180 }}>
                        <label>Type</label>
                        <select
                          value={newFieldType}
                          onChange={(e) => setNewFieldType(e.target.value)}
                        >
                          <option value="alphabetical">Alphabetic</option>
                          <option value="alphanumeric">Alphanumeric</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="dropdown">Dropdown</option>
                          <option value="attachment">Attachment</option>
                        </select>
                      </div>
                      <div style={{ alignSelf: 'flex-end' }}>
                        <button
                          type="button"
                          className="company-settings__btn company-settings__btn--primary"
                          onClick={handleAddCustomField}
                          disabled={addingFormField || !newFieldName.trim()}
                        >
                          <Plus size={14} /> {addingFormField ? 'Adding...' : 'Add Field'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ── Flexi Fields List ── */}
                  <div style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-card, #fff)' }}>
                    <div style={{ padding: '12px 16px', background: 'var(--surface-elevated, #f1f5f9)', borderBottom: '1px solid var(--border, #e2e8f0)', fontWeight: 600, fontSize: 14, color: 'var(--text-primary, #1e293b)', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12, alignItems: 'center' }}>
                      <div>Field Name</div>
                      <div>Type</div>
                      <div>Status</div>
                      <div style={{ width: 80, textAlign: 'right' }}>Actions</div>
                    </div>

                    {formFieldsLoading ? (
                      <TableSkeleton rows={3} />
                    ) : formCustomFields.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontSize: 15 }}>
                        No flexi fields configured for this form yet. Add one above.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {formCustomFields.map((field) => (
                          <div
                            key={field.id}
                            style={{
                              padding: '12px 16px',
                              borderBottom: '1px solid var(--border, #e2e8f0)',
                              display: 'grid',
                              gridTemplateColumns: '2fr 1fr 1fr auto',
                              gap: 12,
                              alignItems: 'center',
                              fontSize: 15,
                              background: 'var(--surface-card, #fff)',
                              color: 'var(--text-primary, #1e293b)'
                            }}
                          >
                            <div style={{ fontWeight: 500, color: 'var(--text-primary, #1e293b)' }}>
                              {field.label}
                              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>Key: {field.fieldKey}</span>
                            </div>
                            <div>
                              <span style={{
                                textTransform: 'capitalize',
                                padding: '3px 10px',
                                borderRadius: 12,
                                background: 'rgba(10, 110, 209, 0.15)',
                                color: 'var(--primary-500, #0a6ed1)',
                                fontSize: 13,
                                fontWeight: 600,
                                display: 'inline-block'
                              }}>
                                {field.fieldType}
                              </span>
                            </div>
                            <div>
                              <button
                                type="button"
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: 12,
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: 13,
                                  fontWeight: 600,
                                  background: field.isVisible ? 'rgba(34, 197, 94, 0.15)' : 'var(--surface-elevated, #f1f5f9)',
                                  color: field.isVisible ? '#22c55e' : 'var(--text-secondary, #64748b)',
                                }}
                                onClick={() => field.id && handleToggleFormFieldVisibility(field.id, field.isVisible)}
                              >
                                {field.isVisible ? 'Active' : 'Hidden'}
                              </button>
                            </div>
                            <div style={{ width: 80, textAlign: 'right' }}>
                              <button
                                type="button"
                                className="company-settings__icon-btn company-settings__icon-btn--danger"
                                onClick={() => field.id && handleDeleteFormField(field.id)}
                                title="Delete field"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Required Documents
          ------------------------------------------------------- */}
      {activeTab === 'form-documents' && (
        <div className="cs-tab-panel cs-mandatory-section" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="cs-section-header__left">
                <h2><FileCheck size={17} /> Required Documents</h2>
                <p style={{ marginTop: 4 }}>
                  Configure document types for the vendor onboarding form. Each document can be marked as Mandatory, Optional, or Any Other via its category dropdown.
                </p>
              </div>
              <button
                className="company-settings__btn company-settings__btn--primary"
                onClick={() => addDocInline('mandatory')}
              >
                <Plus size={14} /> Add Document
              </button>
            </div>
            <div className="cs-section-body">
              {requiredDocsLoading ? (
                <TableSkeleton rows={4} />
              ) : editableDocs.length === 0 ? (
                <div className="cs-mandatory-custom-empty">
                  <FileText size={20} />
                  <p>No documents configured. Click "Add Document" to add one.</p>
                </div>
              ) : (
                <div className="cs-mandatory-custom-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Table Column Headers */}
                  <div className="cs-doc-grid-header">
                    <div>Doc Label</div>
                    <div>Document Name</div>
                    <div>Date of Issue</div>
                    <div>Date of Exp.</div>
                    <div>Issuing Auth.</div>
                    <div>Alert (Days)</div>
                    <div>Frequency</div>
                    <div>Category</div>
                    <div></div>
                  </div>

                  <div className="cs-mandatory-custom-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {editableDocs.map((doc, idx) => (
                      <div key={doc.id} className="cs-mandatory-custom-item--doc-row">
                        <div className="cs-mandatory-item-label" style={{ fontWeight: 700, fontSize: 14.5 }}>
                          Document {idx + 1}
                        </div>
                        <div className="company-settings__field">
                          <input
                            value={doc.name}
                            onChange={(e) => updateDocInline(doc.id, e.target.value)}
                            placeholder="e.g. Emirates ID / Trade License"
                            style={{ fontSize: 16.5, fontWeight: 700 }}
                          />
                        </div>
                        <div>
                          <label className={`cs-doc-toggle-pill ${(doc.trackIssueDate ?? true) ? 'cs-doc-toggle-pill--active' : ''}`}>
                            <input
                              type="checkbox"
                              checked={doc.trackIssueDate ?? true}
                              onChange={(e) => {
                                setEditableDocs(prev => prev.map(d => d.id === doc.id ? { ...d, trackIssueDate: e.target.checked } : d));
                                setDocsDirty(true);
                              }}
                            />
                            {(doc.trackIssueDate ?? true) ? '✓ Enabled' : 'Disabled'}
                          </label>
                        </div>
                        <div>
                          <label className={`cs-doc-toggle-pill ${(doc.trackExpirationDate ?? true) ? 'cs-doc-toggle-pill--active' : ''}`}>
                            <input
                              type="checkbox"
                              checked={doc.trackExpirationDate ?? true}
                              onChange={(e) => {
                                setEditableDocs(prev => prev.map(d => d.id === doc.id ? { ...d, trackExpirationDate: e.target.checked } : d));
                                setDocsDirty(true);
                              }}
                            />
                            {(doc.trackExpirationDate ?? true) ? '✓ Enabled' : 'Disabled'}
                          </label>
                        </div>
                        <div>
                          <label className={`cs-doc-toggle-pill ${(doc.trackIssuingAuthority ?? true) ? 'cs-doc-toggle-pill--active' : ''}`}>
                            <input
                              type="checkbox"
                              checked={doc.trackIssuingAuthority ?? true}
                              onChange={(e) => {
                                setEditableDocs(prev => prev.map(d => d.id === doc.id ? { ...d, trackIssuingAuthority: e.target.checked } : d));
                                setDocsDirty(true);
                              }}
                            />
                            {(doc.trackIssuingAuthority ?? true) ? '✓ Enabled' : 'Disabled'}
                          </label>
                        </div>
                        <div>
                          <input
                            type="number"
                            min={0}
                            max={365}
                            className="cs-doc-number-input"
                            value={doc.expirationAlertDays ?? 30}
                            onChange={(e) => updateDocExpirationAlertDays(doc.id, Number(e.target.value))}
                            placeholder="e.g. 30"
                          />
                        </div>
                        <div>
                          <select
                            className="cs-doc-field-type"
                            value={doc.expirationAlertFrequency || 'DAILY'}
                            onChange={(e) => updateDocExpirationAlertFrequency(doc.id, e.target.value as 'DAILY' | 'WEEKLY' | 'MONTHLY')}
                            style={{ width: '100%', fontSize: 15.5, fontWeight: 600 }}
                          >
                            <option value="DAILY">Daily</option>
                            <option value="WEEKLY">Weekly</option>
                            <option value="MONTHLY">Monthly</option>
                          </select>
                        </div>
                        <div>
                          <select
                            className="cs-doc-category-select"
                            value={doc.documentCategory || 'mandatory'}
                            onChange={(e) => {
                              setEditableDocs(prev => prev.map(d => d.id === doc.id ? { ...d, documentCategory: e.target.value as 'mandatory' | 'optional' } : d));
                              setDocsDirty(true);
                            }}
                            style={{ width: '100%', fontSize: 15.5, fontWeight: 600 }}
                          >
                            <option value="mandatory">Mandatory</option>
                            <option value="optional">Optional</option>
                          </select>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <button
                            className="company-settings__icon-btn company-settings__icon-btn--danger"
                            onClick={() => removeDocInline(doc.id)}
                            title="Remove document"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* -- Save Documents -- */}
              {docsDirty && (
                <div className="cs-mandatory-actions" style={{ marginTop: 24 }}>
                  <button
                    className="company-settings__btn company-settings__btn--primary"
                    onClick={handleSaveDocs}
                    disabled={savingDocs}
                  >
                    <Save size={16} /> {savingDocs ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    className="company-settings__btn company-settings__btn--secondary"
                    onClick={() => {
                      setDocsDirty(false);
                      setEditableDocs(requiredDocuments);
                    }}
                  >
                    <X size={16} /> Discard
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Email Templates
          ------------------------------------------------------- */}
      {activeTab === 'email-templates' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Mail size={17} /> Email Templates</h2>
                <p>Customize the paragraph content of all emails sent by the system. The format and structure will remain the same.</p>
              </div>
            </div>
            <div className="cs-section-body" style={{ padding: 0 }}>
              {emailTemplatesLoading ? (
                <TableSkeleton rows={4} />
              ) : !selectedTemplateKey ? (
                /* ─── LIST VIEW: ENTERPRISE DATA TABLE ─────────── */
                <div className="cs-dt-table-wrapper">
                  <div className="cs-dt-toolbar">
                    <div className="cs-dt-toolbar__left">
                      <div className="cs-dt-type-tabs">
                        <button
                          type="button"
                          className={`cs-dt-type-tab ${emailFilterType === 'ALL' ? 'cs-dt-type-tab--active' : ''}`}
                          onClick={() => setEmailFilterType('ALL')}
                        >
                          All ({EMAIL_TEMPLATE_KEYS.length})
                        </button>
                        <button
                          type="button"
                          className={`cs-dt-type-tab ${emailFilterType === 'CUSTOMIZED' ? 'cs-dt-type-tab--active' : ''}`}
                          onClick={() => setEmailFilterType('CUSTOMIZED')}
                        >
                          Customized
                        </button>
                        <button
                          type="button"
                          className={`cs-dt-type-tab ${emailFilterType === 'DEFAULT' ? 'cs-dt-type-tab--active' : ''}`}
                          onClick={() => setEmailFilterType('DEFAULT')}
                        >
                          Default
                        </button>
                      </div>

                      <div className="cs-dt-search-box">
                        <Search size={14} className="cs-dt-search-icon" />
                        <input
                          type="text"
                          placeholder="Search email templates…"
                          value={emailSearchQuery}
                          onChange={(e) => setEmailSearchQuery(e.target.value)}
                          className="cs-dt-search-input"
                        />
                        {emailSearchQuery && (
                          <button type="button" className="cs-dt-search-clear" onClick={() => setEmailSearchQuery('')}>
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="cs-dt-table-container">
                    <table className="cs-dt-table">
                      <thead>
                        <tr>
                          <th style={{ width: 100, textAlign: 'center' }}>Actions</th>
                          <th>Template Name</th>
                          <th>Template Key</th>
                          <th className="cs-dt-th--right" style={{ width: 160 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmailTemplateKeys.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="cs-dt-table-empty">
                              <Mail size={28} className="cs-dt-table-empty__icon" />
                              <p>No email templates found</p>
                            </td>
                          </tr>
                        ) : (
                          filteredEmailTemplateKeys.map(key => {
                            const saved = emailTemplates.find(t => t.templateKey === key);
                            const isCustom = !!saved && saved.bodyHtml !== '' && saved.bodyHtml !== undefined;
                            const label = EMAIL_TEMPLATE_LABELS[key] || key;

                            return (
                              <tr key={key} className="cs-dt-table-row">
                                <td className="cs-dt-table-cell cs-dt-table-cell--actions">
                                  <div className="cs-dt-action-btns">
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn cs-dt-action-btn--edit"
                                      onClick={() => handleSelectTemplate(key)}
                                      title="Edit Email Template"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                  </div>
                                </td>

                                <td className="cs-dt-table-cell">
                                  <div
                                    className="cs-dt-name-wrapper"
                                    onClick={() => handleSelectTemplate(key)}
                                  >
                                    <Mail size={16} className="cs-dt-doc-icon" />
                                    <span className="cs-dt-template-title">{label}</span>
                                  </div>
                                </td>

                                <td className="cs-dt-table-cell">
                                  <span className="cs-dt-pill-badge">{key}</span>
                                </td>

                                <td className="cs-dt-table-cell cs-dt-td--right">
                                  <span className={`cs-dt-status-badge ${isCustom ? 'cs-dt-status-badge--custom' : 'cs-dt-status-badge--default'}`}>
                                    {isCustom ? 'Customized' : 'Default'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* ─── DETAIL VIEW: EDITOR ───────────────────────── */
                <ErrorBoundary>
                  <div className="cs-dt-detail">
                    <div className="cs-dt-detail__topbar">
                      <button
                        type="button"
                        className="cs-dt-detail__back"
                        onClick={() => {
                          if (templateDirty) {
                            setConfirmModalConfig({
                              isOpen: true,
                              title: 'Unsaved Changes',
                              message: 'Discard unsaved changes?',
                              confirmText: 'Discard',
                              cancelText: 'Cancel',
                              variant: 'warning',
                              onConfirm: () => {
                                setSelectedTemplateKey(null);
                                setEditedBodyHtml('');
                                setTemplateDirty(false);
                              },
                            });
                          } else {
                            setSelectedTemplateKey(null);
                            setEditedBodyHtml('');
                            setTemplateDirty(false);
                          }
                        }}
                      >
                        <ArrowRight size={15} style={{ transform: 'rotate(180deg)' }} />
                        Back to Templates
                      </button>
                      <div className="cs-dt-detail__breadcrumb">
                        <span className="cs-dt-detail__breadcrumb-type">Email Template</span>
                        <span className="cs-dt-detail__breadcrumb-sep">›</span>
                        <span className="cs-dt-detail__breadcrumb-name">{EMAIL_TEMPLATE_LABELS[selectedTemplateKey] || selectedTemplateKey}</span>
                      </div>
                      <span className={templateDirty ? 'cs-doc-badge cs-doc-badge--dirty' : 'cs-doc-badge cs-doc-badge--default'}>
                        {templateDirty ? 'Unsaved changes' : isDefaultTemplate ? 'Using default' : 'Customized'}
                      </span>
                      <div className="cs-dt-detail__actions">
                        <button
                          type="button"
                          className="cs-dt-detail__sec-btn"
                          onClick={handleResetTemplate}
                          disabled={savingTemplate}
                        >
                          <RotateCcw size={14} /> Reset
                        </button>
                        <button
                          type="button"
                          className="cs-dt-detail__save-btn"
                          onClick={handleSaveTemplate}
                          disabled={savingTemplate || !templateDirty}
                        >
                          <Save size={15} />
                          {savingTemplate ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>

                    <div className="cs-dt-detail__body">
                      <div className="cs-dt-detail__editor-col">
                        <div className="cs-dt-detail__editor-wrap">
                          <div className="cs-dt-detail__editor-label">
                            <Mail size={14} /> Email Body Content
                          </div>
                          <RichTextEditor
                            key={selectedTemplateKey}
                            value={editedBodyHtml}
                            onChange={handleBodyChange}
                            placeholder="Write email template content here..."
                            minHeight={320}
                          />
                        </div>

                        <div className="cs-doc-placeholders">
                          <div className="cs-doc-placeholders__title">Available Placeholders</div>
                          <div className="cs-doc-placeholders__list">
                            {Object.entries(EMAIL_PLACEHOLDERS).map(([code, desc]) => (
                              <span key={code} className="cs-doc-placeholders__item">
                                <code className="cs-doc-placeholders__code">{code}</code>
                                {' - '}{desc}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ErrorBoundary>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------
          TAB: Documents & Contracts (Merged Tab)
          ------------------------------------------------------- */}
      {activeTab === 'documents-contracts' && (
        <div className="cs-tab-panel" role="tabpanel">

          {/* ── Sub-Navigation Pill Bar ── */}
          <div className="cs-subtab-bar">
            <button
              type="button"
              className={`cs-subtab-btn ${docContractSubTab === 'contracts' ? 'cs-subtab-btn--active' : ''}`}
              onClick={() => setDocContractSubTab('contracts')}
            >
              <FileText size={15} /> Contract Templates ({contractTemplates.length})
            </button>
            <button
              type="button"
              className={`cs-subtab-btn ${docContractSubTab === 'doc-templates' ? 'cs-subtab-btn--active' : ''}`}
              onClick={() => setDocContractSubTab('doc-templates')}
            >
              <FileSignature size={15} /> Document Templates ({documentTemplates.length})
            </button>
          </div>

          {/* ── Sub-Tab 1: Contract Templates ── */}
          {docContractSubTab === 'contracts' && (
            <div className="cs-section-card">
              <div className="cs-section-header">
                <div className="cs-section-header__left">
                  <h2><FileText size={17} /> Contract Templates</h2>
                  <p>Manage contract templates used when generating vendor contracts after RFQ final approval. Templates are selected by the final approver - not created per contract.</p>
                </div>
              </div>
              <div className="cs-section-body">
                {contractTemplatesLoading ? (
                  <TableSkeleton rows={3} />
                ) : !selectedContractType ? (
                  /* ─── LIST VIEW: ENTERPRISE DATA TABLE ─────────── */
                  <div className="cs-dt-table-wrapper">
                    <div className="cs-dt-toolbar">
                      <div className="cs-dt-toolbar__left">
                        <div className="cs-dt-type-tabs">
                          <button
                            type="button"
                            className={`cs-dt-type-tab ${contractFilterType === 'ALL' ? 'cs-dt-type-tab--active' : ''}`}
                            onClick={() => setContractFilterType('ALL')}
                          >
                            All ({contractTemplates.length})
                          </button>
                        </div>

                        <div className="cs-dt-search-box">
                          <Search size={14} className="cs-dt-search-icon" />
                          <input
                            type="text"
                            placeholder="Search contract templates…"
                            value={contractSearchQuery}
                            onChange={(e) => setContractSearchQuery(e.target.value)}
                            className="cs-dt-search-input"
                          />
                          {contractSearchQuery && (
                            <button type="button" className="cs-dt-search-clear" onClick={() => setContractSearchQuery('')}>
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="cs-dt-toolbar__right">
                        {editingNewContractType ? (
                          <div className="cs-dt-new-inline-form">
                            <input
                              type="text"
                              placeholder="Contract Type Name (e.g. Lease Contract)"
                              value={newContractTypeName}
                              onChange={(e) => setNewContractTypeName(e.target.value)}
                              className="cs-dt-new-input"
                              autoFocus
                            />
                            <button
                              type="button"
                              className="company-settings__btn company-settings__btn--primary"
                              onClick={handleCreateNewContractType}
                              disabled={!newContractTypeName.trim() || savingContractTemplate}
                              style={{ padding: '5px 10px', fontSize: 13 }}
                            >
                              {savingContractTemplate ? 'Adding…' : 'Add'}
                            </button>
                            <button
                              type="button"
                              className="company-settings__btn company-settings__btn--secondary"
                              onClick={() => { setEditingNewContractType(false); setNewContractTypeName(''); }}
                              style={{ padding: '5px 8px', fontSize: 13 }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="company-settings__btn company-settings__btn--primary"
                            onClick={() => setEditingNewContractType(true)}
                            style={{ gap: 6 }}
                          >
                            <Plus size={14} /> New Contract Template
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="cs-dt-table-container">
                      <table className="cs-dt-table">
                        <thead>
                          <tr>
                            <th style={{ width: 100, textAlign: 'center' }}>Actions</th>
                            <th>Template Name</th>
                            <th className="cs-dt-th--right" style={{ width: 140 }}>Status</th>
                            <th className="cs-dt-th--right" style={{ width: 160 }}>Source Format</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredContractTemplates.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="cs-dt-table-empty">
                                <FileText size={28} className="cs-dt-table-empty__icon" />
                                <p>No contract templates found</p>
                              </td>
                            </tr>
                          ) : (
                            filteredContractTemplates.map(t => (
                              <tr key={t.type} className="cs-dt-table-row">
                                <td className="cs-dt-table-cell cs-dt-table-cell--actions">
                                  <div className="cs-dt-action-btns">
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn cs-dt-action-btn--edit"
                                      onClick={() => handleSelectContractType(t.type)}
                                      title="Edit Template"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn"
                                      onClick={() => { setRenamingContractType(t.type); setRenamingContractTypeName(t.name); }}
                                      title="Rename"
                                    >
                                      <FileText size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn cs-dt-action-btn--delete"
                                      onClick={() => handleDeleteContractType(t.type)}
                                      title="Delete"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>

                                <td className="cs-dt-table-cell">
                                  {renamingContractType === t.type ? (
                                    <div className="cs-dt-inline-rename">
                                      <input
                                        type="text"
                                        value={renamingContractTypeName}
                                        onChange={(e) => setRenamingContractTypeName(e.target.value)}
                                        className="cs-dt-inline-rename-input"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleRenameContractType(t.type, renamingContractTypeName);
                                          if (e.key === 'Escape') setRenamingContractType(null);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="company-settings__btn company-settings__btn--primary"
                                        onClick={() => handleRenameContractType(t.type, renamingContractTypeName)}
                                        style={{ padding: '3px 8px', fontSize: 12 }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="company-settings__btn company-settings__btn--secondary"
                                        onClick={() => setRenamingContractType(null)}
                                        style={{ padding: '3px 6px', fontSize: 12 }}
                                      >
                                        <X size={11} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      className="cs-dt-name-wrapper"
                                      onClick={() => handleSelectContractType(t.type)}
                                    >
                                      <FileText size={16} className="cs-dt-doc-icon" />
                                      <span className="cs-dt-template-title">{t.name}</span>
                                    </div>
                                  )}
                                </td>

                                <td className="cs-dt-table-cell cs-dt-td--right">
                                  <span className={`cs-dt-status-badge ${t.version > 1 ? 'cs-dt-status-badge--custom' : 'cs-dt-status-badge--default'}`}>
                                    {t.version > 1 ? `Custom (v${t.version})` : 'Default'}
                                  </span>
                                </td>

                                <td className="cs-dt-table-cell cs-dt-td--right">
                                  {t.fileUrl ? (
                                    <span className="cs-dt-source-badge cs-dt-source-badge--pdf">
                                      <FileText size={13} /> {t.fileName || 'PDF/DOC'}
                                    </span>
                                  ) : (
                                    <span className="cs-dt-source-badge">HTML Editor</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* ─── DETAIL VIEW: EDITOR ───────────────────────── */
                  <ErrorBoundary>
                    <div className="cs-dt-detail">
                      <div className="cs-dt-detail__topbar">
                        <button
                          type="button"
                          className="cs-dt-detail__back"
                          onClick={() => {
                            if (contractTemplateDirty) {
                              setConfirmModalConfig({
                                isOpen: true,
                                title: 'Unsaved Changes',
                                message: 'Discard unsaved changes?',
                                confirmText: 'Discard',
                                cancelText: 'Cancel',
                                variant: 'warning',
                                onConfirm: () => {
                                  setSelectedContractType(null);
                                  setEditedContractContent('');
                                  setEditedContractName('');
                                  setContractTemplateDirty(false);
                                },
                              });
                            } else {
                              setSelectedContractType(null);
                              setEditedContractContent('');
                              setEditedContractName('');
                              setContractTemplateDirty(false);
                            }
                          }}
                        >
                          <ArrowRight size={15} style={{ transform: 'rotate(180deg)' }} />
                          Back to Templates
                        </button>
                        <div className="cs-dt-detail__breadcrumb">
                          <span className="cs-dt-detail__breadcrumb-type">{selectedContractTemplate?.name || selectedContractTemplate?.type}</span>
                          <span className="cs-dt-detail__breadcrumb-sep">›</span>
                          <span className="cs-dt-detail__breadcrumb-name">{editedContractName || selectedContractTemplate?.name}</span>
                        </div>
                        <label className="cs-dt-detail__toggle">
                          <input
                            type="checkbox"
                            checked={editedContractIsActive}
                            onChange={(e) => { setEditedContractIsActive(e.target.checked); setContractTemplateDirty(true); }}
                          />
                          {editedContractIsActive ? 'Active' : 'Inactive'}
                        </label>
                        <span className={contractTemplateDirty ? 'cs-doc-badge cs-doc-badge--dirty' : 'cs-doc-badge cs-doc-badge--default'}>
                          {contractTemplateDirty ? 'Unsaved changes' : contractTemplateIsDefault ? 'Default' : 'Customized'}
                        </span>
                        <div className="cs-dt-detail__actions">
                          <button
                            type="button"
                            className="cs-dt-detail__sec-btn"
                            onClick={handleResetContractTemplate}
                            disabled={savingContractTemplate || contractTemplateIsDefault}
                          >
                            <RotateCcw size={14} /> Reset
                          </button>
                          <button
                            type="button"
                            className="cs-dt-detail__save-btn"
                            onClick={handleSaveContractTemplate}
                            disabled={savingContractTemplate || !contractTemplateDirty}
                          >
                            <Save size={15} />
                            {savingContractTemplate ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>

                      <div className="cs-dt-detail__body">
                        <div className="cs-dt-detail__editor-col">
                          <div className="cs-dt-detail__name-row">
                            <label className="cs-dt-detail__name-label">Template Name</label>
                            <input
                              value={editedContractName || ''}
                              onChange={(e) => handleContractNameChange(e.target.value)}
                              placeholder="Template Name"
                              className="cs-dt-detail__name-input"
                            />
                          </div>

                          <div className="cs-dt-upload-strip">
                            <div className="cs-dt-upload-strip__left">
                              <FileText size={16} className="cs-dt-upload-strip__icon" />
                              <div>
                                <div className="cs-dt-upload-strip__label">Contract Document (PDF/DOC) (optional)</div>
                                <div className="cs-dt-upload-strip__desc">Upload a document file or extract text into the rich editor below</div>
                              </div>
                            </div>
                            <div className="cs-dt-upload-strip__right">
                              {selectedContractTemplate?.fileUrl ? (
                                <div className="cs-dt-upload-strip__file">
                                  <FileText size={13} />
                                  <span>{selectedContractTemplate.fileName || 'Uploaded document'}</span>
                                  <a href={selectedContractTemplate.fileUrl} target="_blank" rel="noopener noreferrer" className="cs-dt-upload-strip__view">View</a>
                                  <button
                                    type="button"
                                    className="cs-dt-upload-strip__remove"
                                    onClick={async () => {
                                      if (!selectedContractType) return;
                                      try {
                                        await companySettingsService.saveContractTemplate(selectedContractType, {
                                          name: editedContractName,
                                          content: editedContractContent,
                                          description: editedContractDescription || null,
                                          isActive: editedContractIsActive,
                                          fileUrl: null,
                                          fileName: null,
                                          fileType: null,
                                        });
                                        setContractTemplateDirty(false);
                                        await fetchContractTemplates();
                                        setPageMsg('Uploaded document removed from template.');
                                      } catch (err) {
                                        setPageMsg(err instanceof Error ? err.message : 'Failed to remove document');
                                      }
                                    }}
                                    disabled={contractFileUploading}
                                    title="Remove"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ) : (
                                <label className="cs-dt-upload-strip__btn">
                                  <input
                                    type="file"
                                    accept={ALLOWED_CONTRACT_UPLOAD_EXTENSIONS}
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file || !selectedContractType) return;
                                      setContractFileUploading(true);
                                      try {
                                        const result = await companySettingsService.uploadContractTemplateFile(selectedContractType, file);
                                        const extractedText = (result as any).ocrText;
                                        const ocrStatus = (result as any).ocrStatus || (extractedText ? 'COMPLETED' : null);

                                        await companySettingsService.saveContractTemplate(selectedContractType, {
                                          name: editedContractName,
                                          content: extractedText ? textToHtml(extractedText) : editedContractContent,
                                          description: editedContractDescription || null,
                                          isActive: editedContractIsActive,
                                          fileUrl: result.fileUrl,
                                          fileName: result.fileName,
                                          fileType: result.fileType,
                                        });
                                        setContractTemplateDirty(false);
                                        await fetchContractTemplates();
                                        setContractTemplates(prev => prev.map(t =>
                                          t.type === selectedContractType ? {
                                            ...t,
                                            fileUrl: result.fileUrl,
                                            fileName: result.fileName,
                                            fileType: result.fileType,
                                            ocrStatus: ocrStatus,
                                            ocrText: extractedText || t.ocrText,
                                            ocrProcessedAt: extractedText ? new Date().toISOString() : t.ocrProcessedAt,
                                          } : t
                                        ));
                                        if (extractedText) {
                                          setEditedContractContent(textToHtml(extractedText));
                                          setPageMsg(`Document "${file.name}" uploaded and text extracted via OCR!`);
                                        } else {
                                          setPageMsg(`Document "${file.name}" uploaded and attached to template.`);
                                        }
                                      } catch (err) {
                                        setPageMsg(err instanceof Error ? err.message : 'Upload failed');
                                      } finally {
                                        setContractFileUploading(false);
                                      }
                                      e.target.value = '';
                                    }}
                                  />
                                  {contractFileUploading ? <><Loader2 size={13} className="cs-spin" /> Uploading…</> : <><Upload size={13} /> Choose File</>}
                                </label>
                              )}

                              <button
                                type="button"
                                className="cs-dt-ocr-btn"
                                onClick={() => {
                                  if (!selectedContractTemplate?.fileUrl) {
                                    setPageMsg('Please upload a PDF/DOC file first before running OCR.');
                                    return;
                                  }
                                  const validOcrText = selectedContractTemplate?.ocrText;
                                  if (validOcrText && validOcrText !== 'No readable text detected.' && !validOcrText.startsWith('OCR failed')) {
                                    setEditedContractContent(textToHtml(validOcrText));
                                    setContractTemplateDirty(true);
                                    setContractTemplates(prev => prev.map(t => t.type === selectedContractType ? { ...t, ocrStatus: 'COMPLETED' } : t));
                                    setPageMsg('Extracted OCR text applied to rich editor!');
                                  } else {
                                    handleTriggerContractOcr();
                                  }
                                }}
                                disabled={selectedContractTemplate?.ocrStatus === 'PROCESSING' || contractFileUploading}
                                title="Run OCR on document and insert text into editor"
                              >
                                {selectedContractTemplate?.ocrStatus === 'PROCESSING' ? (
                                  <><Loader2 size={13} className="cs-spin" /> Processing OCR…</>
                                ) : (
                                  <><Sparkles size={13} /> Run OCR & Insert Text</>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="cs-dt-detail__editor-wrap">
                            <div className="cs-dt-detail__editor-label">
                              <FileSignature size={14} /> Contract Template Content
                            </div>
                            <RichTextEditor
                              key={selectedContractType ?? 'none'}
                              value={editedContractContent}
                              onChange={handleContractContentChange}
                              placeholder="Write contract template content here... Use {{contract_number}}, {{vendor_name}}, {{contract_value}}, etc."
                              minHeight={320}
                            />
                          </div>

                          <div className="cs-doc-placeholders">
                            <div className="cs-doc-placeholders__title">Available Placeholders</div>
                            <div className="cs-doc-placeholders__list">
                              {Object.entries(CONTRACT_PLACEHOLDERS).map(([code, desc]) => (
                                <span key={code} className="cs-doc-placeholders__item">
                                  <code className="cs-doc-placeholders__code">{code}</code>
                                  {' - '}{desc}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="cs-dt-signature-block">
                            <div className="cs-dt-signature-block__header">
                              <FileSignature size={16} />
                              <h3>Company Signature Configuration</h3>
                            </div>
                            <p className="cs-dt-signature-block__desc">
                              Draw or upload your official company signature below. It will automatically embed in generated contract agreements.
                            </p>
                            <div className="cs-dt-signature-block__content">
                              <SignatureSection />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ErrorBoundary>
                )}
              </div>
            </div>
          )}

          {/* ── Sub-Tab 2: Document Templates (NDA/MNDA) ── */}
          {docContractSubTab === 'doc-templates' && (
            <div className="cs-section-card">
              <div className="cs-section-header">
                <div className="cs-section-header__left">
                  <h2><FileSignature size={17} /> Document Templates (NDA & MNDA)</h2>
                  <p>Manage NDA and MNDA templates used during vendor onboarding. Create multiple templates per type, add, rename, and delete them as needed.</p>
                </div>
              </div>
              <div className="cs-section-body">
                {docTemplatesLoading ? (
                  <TableSkeleton rows={3} />
                ) : selectedDocId ? (
                  /* ─── DETAIL VIEW ───────────────────────────────── */
                  <ErrorBoundary>
                    <div className="cs-dt-detail">
                      <div className="cs-dt-detail__topbar">
                        <button
                          type="button"
                          className="cs-dt-detail__back"
                          onClick={() => {
                            if (docTemplateDirty) {
                              setConfirmModalConfig({
                                isOpen: true,
                                title: 'Unsaved Changes',
                                message: 'Discard unsaved changes?',
                                confirmText: 'Discard',
                                cancelText: 'Cancel',
                                variant: 'warning',
                                onConfirm: () => {
                                  setSelectedDocId(null);
                                  setEditedDocContent('');
                                  setEditedDocName('');
                                  setDocTemplateDirty(false);
                                },
                              });
                            } else {
                              setSelectedDocId(null);
                              setEditedDocContent('');
                              setEditedDocName('');
                              setDocTemplateDirty(false);
                            }
                          }}
                        >
                          <ArrowRight size={15} style={{ transform: 'rotate(180deg)' }} />
                          Back to Templates
                        </button>
                        <div className="cs-dt-detail__breadcrumb">
                          <span className="cs-dt-detail__breadcrumb-type">{selectedDocTemplate?.type}</span>
                          <span className="cs-dt-detail__breadcrumb-sep">›</span>
                          <span className="cs-dt-detail__breadcrumb-name">{editedDocName || selectedDocTemplate?.name}</span>
                        </div>
                        <span className={docTemplateDirty ? 'cs-doc-badge cs-doc-badge--dirty' : 'cs-doc-badge cs-doc-badge--default'}>
                          {docTemplateDirty ? 'Unsaved changes' : docTemplateIsDefault ? 'Default' : 'Customized'}
                        </span>
                        <div className="cs-dt-detail__actions">
                          <button
                            type="button"
                            className="cs-dt-detail__sec-btn"
                            onClick={handleResetDocTemplate}
                            disabled={savingDocTemplate}
                          >
                            <RotateCcw size={14} /> Reset
                          </button>
                          <button
                            type="button"
                            className="cs-dt-detail__save-btn"
                            onClick={handleSaveDocTemplate}
                            disabled={savingDocTemplate || !docTemplateDirty}
                          >
                            <Save size={15} />
                            {savingDocTemplate ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>

                      <div className="cs-dt-detail__body">
                        <div className="cs-dt-detail__editor-col">
                          <div className="cs-dt-detail__name-row">
                            <label className="cs-dt-detail__name-label">Template Name</label>
                            <input
                              value={editedDocName || ''}
                              onChange={(e) => handleDocNameChange(e.target.value)}
                              placeholder="Template Name"
                              className="cs-dt-detail__name-input"
                            />
                          </div>

                          <div className="cs-dt-upload-strip">
                            <div className="cs-dt-upload-strip__left">
                                      <FileText size={16} className="cs-dt-upload-strip__icon" />
                              <div>
                                <div className="cs-dt-upload-strip__label">Upload PDF/DOC (optional)</div>
                                <div className="cs-dt-upload-strip__desc">Upload a document file or extract text into the rich editor below</div>
                              </div>
                            </div>
                            <div className="cs-dt-upload-strip__right">
                              {selectedDocTemplate?.fileUrl ? (
                                <div className="cs-dt-upload-strip__file">
                                  <FileText size={13} />
                                  <span>{selectedDocTemplate.fileName || 'Uploaded document'}</span>
                                  <a href={selectedDocTemplate.fileUrl} target="_blank" rel="noopener noreferrer" className="cs-dt-upload-strip__view">View</a>
                                  <button type="button" className="cs-dt-upload-strip__remove" onClick={handleRemoveDocumentFile} disabled={docFileUploading || !canCreateSettings} title="Remove">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ) : (
                                <label className="cs-dt-upload-strip__btn">
                                  <input type="file" accept={ALLOWED_CONTRACT_UPLOAD_EXTENSIONS} style={{ display: 'none' }} onChange={handleUploadDocumentFile} />
                                  {docFileUploading ? <><Loader2 size={13} className="cs-spin" /> Uploading…</> : <><Upload size={13} /> Choose File</>}
                                </label>
                              )}

                              <button
                                type="button"
                                className="cs-dt-ocr-btn"
                                onClick={() => {
                                  if (!selectedDocTemplate?.fileUrl) {
                                    setPageMsg('Please upload a PDF/DOC file first before running OCR.');
                                    return;
                                  }
                                  const validDocOcrText = selectedDocTemplate?.ocrText;
                                  if (validDocOcrText && validDocOcrText !== 'No readable text detected.' && !validDocOcrText.startsWith('OCR failed')) {
                                    setEditedDocContent(textToHtml(validDocOcrText));
                                    setDocTemplateDirty(true);
                                    setDocumentTemplates(prev => prev.map(t => t.id === selectedDocId ? { ...t, ocrStatus: 'COMPLETED' } : t));
                                    setPageMsg('Extracted OCR text applied to rich editor!');
                                  } else {
                                    handleTriggerDocumentOcr();
                                  }
                                }}
                                disabled={selectedDocTemplate?.ocrStatus === 'PROCESSING' || docFileUploading}
                                title="Run OCR on document and insert text into editor"
                              >
                                {selectedDocTemplate?.ocrStatus === 'PROCESSING' ? (
                                  <><Loader2 size={13} className="cs-spin" /> Processing OCR…</>
                                ) : (
                                  <><Sparkles size={13} /> Run OCR & Insert Text</>
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="cs-dt-detail__editor-wrap">
                            <div className="cs-dt-detail__editor-label">
                              <FileSignature size={14} /> Template Content
                            </div>
                            <RichTextEditor
                              key={selectedDocId ?? 'none'}
                              value={editedDocContent}
                              onChange={handleDocContentChange}
                              placeholder="Write template content here… use {{companyName}}, {{vendorName}}, {{currentDate}}, etc."
                              minHeight={320}
                            />
                          </div>

                          {/* Signature Configuration Block inside Editor */}
                          <div className="cs-dt-signature-block">
                            <div className="cs-dt-signature-block__header">
                              <FileSignature size={16} />
                              <h3>Company Signature Configuration</h3>
                            </div>
                            <p className="cs-dt-signature-block__desc">
                              Draw or upload your official company signature below. It will automatically embed in generated agreements.
                            </p>
                            <div className="cs-dt-signature-block__content">
                              <SignatureSection />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ErrorBoundary>
                ) : (
                  /* ─── LIST VIEW ─── */
                  <div className="cs-dt-table-wrapper">
                    {/* ── Toolbar / Controls Bar ── */}
                    <div className="cs-dt-toolbar">
                      <div className="cs-dt-toolbar__left">
                        <div className="cs-dt-type-tabs">
                          <button
                            type="button"
                            className={`cs-dt-type-tab ${docTypeFilter === 'ALL' ? 'cs-dt-type-tab--active' : ''}`}
                            onClick={() => setDocTypeFilter('ALL')}
                          >
                            All ({documentTemplates.length})
                          </button>
                          {DOC_TEMPLATE_TYPES.map(type => {
                            const count = documentTemplates.filter(t => t.type === type).length;
                            const label = type === 'ANY_OTHER' ? 'Any Other' : type;
                            return (
                              <button
                                key={type}
                                type="button"
                                className={`cs-dt-type-tab ${docTypeFilter === type ? 'cs-dt-type-tab--active' : ''}`}
                                onClick={() => setDocTypeFilter(type)}
                              >
                                {label} ({count})
                              </button>
                            );
                          })}
                        </div>

                        <div className="cs-dt-search-box">
                          <Search size={14} className="cs-dt-search-icon" />
                          <input
                            type="text"
                            value={docSearchQuery}
                            onChange={(e) => setDocSearchQuery(e.target.value)}
                            placeholder="Search templates by name..."
                            className="cs-dt-search-input"
                          />
                          {docSearchQuery && (
                            <button type="button" className="cs-dt-search-clear" onClick={() => setDocSearchQuery('')}>
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="cs-dt-toolbar__right">
                        {editingNewDoc ? (
                          <div className="cs-dt-new-inline-form">
                            <select
                              value={editingNewDoc}
                              onChange={(e) => setEditingNewDoc(e.target.value as 'NDA' | 'MNDA' | 'ANY_OTHER')}
                              className="cs-dt-new-select"
                            >
                              <option value="NDA">NDA</option>
                              <option value="MNDA">MNDA</option>
                              <option value="ANY_OTHER">Any Other Document</option>
                            </select>
                            <input
                              type="text"
                              value={newDocName}
                              onChange={(e) => setNewDocName(e.target.value)}
                              placeholder={`New ${editingNewDoc} template name...`}
                              className="cs-dt-new-input"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateNewDocTemplate(editingNewDoc);
                                if (e.key === 'Escape') { setEditingNewDoc(null); setNewDocName(''); }
                              }}
                            />
                            <button
                              type="button"
                              className="company-settings__btn company-settings__btn--primary"
                              onClick={() => handleCreateNewDocTemplate(editingNewDoc)}
                              disabled={!newDocName.trim() || savingDocTemplate}
                              style={{ padding: '6px 12px', fontSize: 13 }}
                            >
                              <Plus size={13} /> {savingDocTemplate ? 'Creating…' : 'Create'}
                            </button>
                            <button
                              type="button"
                              className="company-settings__btn company-settings__btn--secondary"
                              onClick={() => { setEditingNewDoc(null); setNewDocName(''); }}
                              style={{ padding: '6px 10px', fontSize: 13 }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="company-settings__btn company-settings__btn--primary"
                            onClick={() => { setEditingNewDoc('NDA'); setNewDocName(''); }}
                          >
                            <Plus size={15} /> Add Document
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Data Table ── */}
                    <div className="cs-dt-table-container">
                      <table className="cs-dt-table">
                        <thead>
                          <tr>
                            <th style={{ width: 110, textAlign: 'center' }}>Actions</th>
                            <th>Template Name</th>
                            <th style={{ width: 100 }}>Type</th>
                            <th className="cs-dt-th--right" style={{ width: 140 }}>Status</th>
                            <th className="cs-dt-th--right" style={{ width: 160 }}>Source Format</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDocTemplates.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="cs-dt-table-empty">
                                <FileSignature size={28} className="cs-dt-table-empty__icon" />
                                <p>No document templates found</p>
                              </td>
                            </tr>
                          ) : (
                            filteredDocTemplates.map((tmpl) => (
                              <tr key={tmpl.id} className="cs-dt-table-row">
                                <td className="cs-dt-table-cell cs-dt-table-cell--actions">
                                  <div className="cs-dt-action-btns">
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn cs-dt-action-btn--edit"
                                      onClick={() => handleSelectDocTemplate(tmpl.id)}
                                      title="Edit Template"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn"
                                      onClick={() => { setRenamingDocId(tmpl.id); setRenamingDocName(tmpl.name); }}
                                      title="Rename"
                                    >
                                      <FileText size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="cs-dt-action-btn cs-dt-action-btn--delete"
                                      onClick={() => handleDeleteDocTemplate(tmpl.id)}
                                      title="Delete"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                                <td className="cs-dt-table-cell">
                                  {renamingDocId === tmpl.id ? (
                                    <div className="cs-dt-inline-rename">
                                      <input
                                        type="text"
                                        value={renamingDocName}
                                        onChange={(e) => setRenamingDocName(e.target.value)}
                                        className="cs-dt-inline-rename-input"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleRenameDocTemplate(tmpl.id, renamingDocName);
                                          if (e.key === 'Escape') setRenamingDocId(null);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="company-settings__btn company-settings__btn--primary"
                                        onClick={() => handleRenameDocTemplate(tmpl.id, renamingDocName)}
                                        style={{ padding: '3px 8px', fontSize: 12 }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="company-settings__btn company-settings__btn--secondary"
                                        onClick={() => setRenamingDocId(null)}
                                        style={{ padding: '3px 6px', fontSize: 12 }}
                                      >
                                        <X size={11} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div
                                      className="cs-dt-name-wrapper"
                                      onClick={() => handleSelectDocTemplate(tmpl.id)}
                                    >
                                      <FileText size={16} className="cs-dt-doc-icon" />
                                      <span className="cs-dt-template-title">{tmpl.name}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="cs-dt-table-cell">
                                  <span className={`cs-dt-type-badge cs-dt-type-badge--${tmpl.type.toLowerCase()}`}>
                                    {tmpl.type}
                                  </span>
                                </td>
                                <td className="cs-dt-table-cell cs-dt-td--right">
                                  <span className={`cs-dt-status-badge ${tmpl.version > 1 ? 'cs-dt-status-badge--custom' : 'cs-dt-status-badge--default'}`}>
                                    {tmpl.version > 1 ? `v${tmpl.version} Customized` : 'Default'}
                                  </span>
                                </td>
                                <td className="cs-dt-table-cell cs-dt-td--right">
                                  {tmpl.fileUrl ? (
                                    <span className="cs-dt-source-badge cs-dt-source-badge--pdf">
                                      <FileText size={12} /> PDF Document
                                    </span>
                                  ) : (
                                    <span className="cs-dt-source-badge cs-dt-source-badge--html">
                                      <FileSignature size={12} /> Rich HTML
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}



        </div>
      )}
      {/* ---- MODALS (unchanged logic) ------ */}

      {/* ── Contract Template Preview ── */}
      {contractPreviewOpen && (
        <div className="company-settings__backdrop" onClick={() => setContractPreviewOpen(false)}>
          <div className="company-settings__modal company-settings__modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Eye size={18} /> Template Preview - {editedContractName}</span>
              <button className="company-settings__icon-btn" onClick={() => setContractPreviewOpen(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              <div
                className="ctr-detail__doc-preview"
                dangerouslySetInnerHTML={{ __html: editedContractContent }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Department Modal ── */}
      {showDeptModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowDeptModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Building2 size={18} /> {editingDept ? 'Edit Department' : 'Add Department'}</span>
              <button className="company-settings__icon-btn" onClick={() => setShowDeptModal(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              {deptError && (
                <div className="cs-modal-error" style={{ marginBottom: 12 }}>
                  <MessageStrip type="error" compact>{deptError}</MessageStrip>
                </div>
              )}
              <div className="company-settings__field">
                <label>Department Name <span>*</span></label>
                <input
                  value={deptName}
                  onChange={(e) => { setDeptName(e.target.value); setDeptError(null); }}
                  placeholder="e.g. R&D"
                  className={deptError ? 'cs-input--error' : ''}
                />
                <PredictiveMatchCard
                  query={deptName}
                  items={departments}
                  excludeId={editingDept?.id}
                  labelName="Department"
                />
              </div>
              <div className="company-settings__field">
                <label>Description</label>
                <textarea value={deptDesc} onChange={(e) => setDeptDesc(e.target.value)} placeholder="Optional description" rows={3} />
              </div>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowDeptModal(false)}>Cancel</button>
              <button className="company-settings__btn company-settings__btn--primary" disabled={!deptName.trim() || actionLoading} onClick={handleSaveDept}>
                <Save size={16} /> {actionLoading ? 'Saving…' : editingDept ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {/* ── Delete Contract Type Confirmation Modal ── */}
      {deleteContractTypeTarget && (
        <div className="company-settings__backdrop" onClick={cancelDeleteContractType}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Trash2 size={18} style={{ color: 'var(--danger-500)' }} /> Delete Contract Type?</span>
              <button className="company-settings__icon-btn" onClick={cancelDeleteContractType}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              <p style={{ margin: 0, fontSize: '1.0125rem' }}>
                Permanently delete <strong>{contractTemplates.find(t => t.type === deleteContractTypeTarget)?.name || deleteContractTypeTarget}</strong>?
              </p>
              <p style={{ margin: '12px 0 0', fontSize: '0.9125rem', color: 'var(--text-secondary)' }}>
                This contract type and its template will be permanently removed from the system. Existing contracts using this type will not be affected. This action cannot be undone.
              </p>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={cancelDeleteContractType}>Cancel</button>
              <button
                className="company-settings__btn company-settings__btn--danger"
                disabled={savingContractTemplate}
                onClick={handleDeleteContractTypeConfirm}
              >
                <Trash2 size={16} /> {savingContractTemplate ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDocIdTarget && (
        <div className="company-settings__backdrop" onClick={cancelDeleteDocTemplate}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Trash2 size={18} style={{ color: 'var(--danger-500)' }} /> Delete Document Template?</span>
              <button className="company-settings__icon-btn" onClick={cancelDeleteDocTemplate}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              <p style={{ margin: 0, fontSize: '1.0125rem' }}>
                Permanently delete <strong>{documentTemplates.find(t => t.id === deleteDocIdTarget)?.name || 'this template'}</strong>?
              </p>
              <p style={{ margin: '12px 0 0', fontSize: '0.9125rem', color: 'var(--text-secondary)' }}>
                This template will be permanently removed. Existing onboarding documents using this template will not be affected. This action cannot be undone.
              </p>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={cancelDeleteDocTemplate}>Cancel</button>
              <button
                className="company-settings__btn company-settings__btn--danger"
                disabled={savingDocTemplate}
                onClick={confirmDeleteDocTemplate}
              >
                <Trash2 size={16} /> {savingDocTemplate ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="company-settings__backdrop" onClick={cancelDelete}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Trash2 size={18} style={{ color: 'var(--danger-500)' }} /> Delete {deleteTarget.type === 'department' ? 'Department' : deleteTarget.type === 'category' ? 'Category' : deleteTarget.type === 'unit' ? 'Unit' : deleteTarget.type === 'paymentTerm' ? 'Payment Term' : deleteTarget.type === 'requiredDocument' ? 'Required Document' : 'Position'}?</span>
              <button className="company-settings__icon-btn" onClick={cancelDelete}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              <p style={{ margin: 0, fontSize: '1.0125rem' }}>
                Permanently delete <strong>{deleteTarget.name}</strong>{deleteTarget.type === 'department' ? ' and all its categories' : ''}?
              </p>
              <p style={{ margin: '12px 0 0', fontSize: '0.9125rem', color: 'var(--text-secondary)' }}>
                {deleteTarget.type === 'department'
                  ? 'All categories under this department will also be deleted. Vendors assigned to these categories will keep their profile but lose the category link. This action cannot be undone.'
                  : deleteTarget.type === 'category'
                    ? 'Vendors currently assigned to this category will keep their profile but lose the category link. This action cannot be undone.'
                    : deleteTarget.type === 'unit'
                      ? 'This unit will be removed from the system. Existing RFQ line items using this unit will not be affected. This action cannot be undone.'
                      : deleteTarget.type === 'paymentTerm'
                        ? 'This payment term will be removed. Existing quotations already using this term will not be affected. This action cannot be undone.'
                        : deleteTarget.type === 'requiredDocument'
                          ? 'This required document will be removed from the vendor onboarding form. Existing vendor documents of this type will not be affected. This action cannot be undone.'
                          : 'This position will be removed from the system. Existing users assigned to this position will not be affected. This action cannot be undone.'}
              </p>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={cancelDelete}>Cancel</button>
              <button
                className="company-settings__btn company-settings__btn--danger"
                disabled={deleting}
                onClick={confirmDelete}
              >
                <Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Confirmation Modal ── */}
      {confirmModalConfig && confirmModalConfig.isOpen && (
        <div className="company-settings__backdrop" onClick={() => setConfirmModalConfig(null)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span>
                {confirmModalConfig.variant === 'danger' ? (
                  <Trash2 size={18} style={{ color: 'var(--danger-500)' }} />
                ) : confirmModalConfig.variant === 'warning' ? (
                  <AlertTriangle size={18} style={{ color: 'var(--warning-500)', marginRight: 8, verticalAlign: 'middle' }} />
                ) : (
                  <Info size={18} style={{ color: 'var(--primary-500)', marginRight: 8, verticalAlign: 'middle' }} />
                )}
                {confirmModalConfig.title}
              </span>
              <button className="company-settings__icon-btn" onClick={() => setConfirmModalConfig(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="company-settings__modal-body">
              <p style={{ margin: 0, fontSize: '1.0125rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {typeof confirmModalConfig.message === 'string' ? confirmModalConfig.message : (typeof confirmModalConfig.message === 'object' && confirmModalConfig.message !== null) ? JSON.stringify(confirmModalConfig.message) : String(confirmModalConfig.message)}
              </p>
            </div>
            <div className="company-settings__modal-footer">
              <button
                type="button"
                className="company-settings__btn company-settings__btn--secondary"
                onClick={() => setConfirmModalConfig(null)}
              >
                {confirmModalConfig.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                className={`company-settings__btn ${
                  confirmModalConfig.variant === 'danger'
                    ? 'company-settings__btn--danger'
                    : 'company-settings__btn--primary'
                }`}
                onClick={() => {
                  const action = confirmModalConfig.onConfirm;
                  setConfirmModalConfig(null);
                  action();
                }}
              >
                {confirmModalConfig.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Backfill Success Modal ── */}
      {showBackfillSuccess && backfillResult !== null && (
        <div className="company-settings__backdrop" onClick={() => setShowBackfillSuccess(false)}>
          <div
            className="company-settings__modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420, textAlign: 'center', padding: 0, overflow: 'hidden' }}
          >
            {/* Top gradient bar */}
            <div style={{ height: 5, background: 'linear-gradient(90deg, #0a6ed1, #4795e8)' }} />

            <div style={{ padding: '32px 32px 24px' }}>
              {/* Animated checkmark circle */}
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
                boxShadow: '0 4px 16px rgba(46,125,50,0.18)',
              }}>
                <CheckCircle2 size={36} color="#2e7d32" />
              </div>

              <h3 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 700, color: 'var(--text-primary)' }}>
                {backfillResult.updated > 0 ? 'Codes Assigned!' : 'Already Up to Date'}
              </h3>
              <p style={{ margin: '0 0 24px', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {backfillResult.updated > 0
                  ? `Sequential supplier codes have been successfully assigned to ${backfillResult.updated} existing vendor(s).`
                  : 'All existing vendors already have a supplier code assigned. No changes were made.'}
              </p>

              {/* Stats */}
              <div style={{
                display: 'flex', gap: 12, marginBottom: 24,
              }}>
                <div style={{
                  flex: 1, background: 'var(--surface-elevated, #f8fafc)',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 10, padding: '14px 12px',
                }}>
                  <div style={{ fontSize: 29, fontWeight: 800, color: '#0a6ed1', lineHeight: 1 }}>
                    {backfillResult.updated}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Vendors Updated
                  </div>
                </div>
                <div style={{
                  flex: 1, background: 'var(--surface-elevated, #f8fafc)',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 10, padding: '14px 12px',
                }}>
                  <div style={{ fontSize: 29, fontWeight: 800, color: '#107e3e', lineHeight: 1 }}>
                    {backfillResult.nextCounter}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Next Counter
                  </div>
                </div>
              </div>

              <button
                className="company-settings__btn company-settings__btn--primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setShowBackfillSuccess(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unit Modal ── */}
      {showUnitModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowUnitModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span>Add Unit</span>
              <button className="company-settings__icon-btn" onClick={() => setShowUnitModal(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              {unitError && (
                <div className="cs-modal-error" style={{ marginBottom: 12 }}>
                  <MessageStrip type="error" compact>{unitError}</MessageStrip>
                </div>
              )}

              {/* Standard Embedded Units Dropdown */}
              <div className="company-settings__field">
                <label>Standard Units Preset</label>
                <select
                  value={selectedPresetUnit}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedPresetUnit(val);
                    if (val) {
                      setUnitName(val);
                      setUnitError(null);
                    }
                  }}
                  className="cs-select"
                >
                  <option value="">-- Select from Standard Units (or enter custom unit below) --</option>
                  {Array.from(new Set(EMBEDDED_STANDARD_UNITS.map((u) => u.category))).map((cat) => (
                    <optgroup key={cat} label={cat}>
                      {EMBEDDED_STANDARD_UNITS.filter((u) => u.category === cat).map((u) => {
                        const isAdded = units.some((existing) => {
                          const exLower = existing.name.trim().toLowerCase();
                          if (exLower === u.name.toLowerCase()) return true;
                          const group = findSynonymGroup(u.name);
                          return group ? group.includes(exLower) : false;
                        });
                        return (
                          <option key={u.name} value={u.name}>
                            {u.name} {isAdded ? '✓ (Already added)' : ''}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
                <span className="cs-field-hint">
                  Pick a standard embedded unit to auto-fill, or enter any custom unit below.
                </span>
              </div>

              {/* Unit Name Input & Predictive Analysis */}
              <div className="company-settings__field">
                <label>Unit Name <span>*</span></label>
                <input
                  value={unitName}
                  onChange={(e) => {
                    setUnitName(e.target.value);
                    setSelectedPresetUnit('');
                    setUnitError(null);
                  }}
                  placeholder="e.g. Kilogram, Gram, Litre, Metre, Piece"
                  className={unitError ? 'cs-input--error' : ''}
                />
                <PredictiveMatchCard
                  query={unitName}
                  items={units}
                  labelName="Unit"
                />
              </div>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowUnitModal(false)}>Cancel</button>
              <button className="company-settings__btn company-settings__btn--primary" disabled={!unitName.trim() || actionLoading} onClick={handleSaveUnit}>
                <Save size={16} /> {actionLoading ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ── Branch Modal ── */}
      {showBranchModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowBranchModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580, width: '100%', overflowX: 'hidden' }}>
            <div className="company-settings__modal-header">
              <span>{editingBranch ? `Edit Branch #${editingBranch.code}` : 'Add New Branch'}</span>
              <button className="company-settings__icon-btn" onClick={() => setShowBranchModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="company-settings__modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div className="company-settings__field">
                  <label>Branch Code <span>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. DEL-01"
                    value={bCode}
                    onChange={(e) => setBCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="company-settings__field">
                  <label>Branch Name <span>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Delhi Regional Office"
                    value={bName}
                    onChange={(e) => setBName(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="company-settings__field">
                  <label>City / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Delhi"
                    value={bCity}
                    onChange={(e) => setBCity(e.target.value)}
                  />
                </div>
                <div className="company-settings__field">
                  <label>Branch Manager</label>
                  <select
                    value={bManagerId}
                    onChange={(e) => setBManagerId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-card)', color: 'var(--text-primary)', outline: 'none' }}
                  >
                    <option value="">Select Branch Manager...</option>
                    {userList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="company-settings__field">
                <label>Address Details</label>
                <textarea
                  placeholder="Street address, building name, suite number..."
                  value={bAddress}
                  onChange={(e) => setBAddress(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-card)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4, padding: '12px 14px', background: 'var(--surface-ground)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={bIsActive}
                    onChange={(e) => setBIsActive(e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span>Active Status</span>
                </label>
              </div>
            </div>

            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowBranchModal(false)}>Cancel</button>
              <button
                className="company-settings__btn company-settings__btn--primary"
                disabled={!bCode.trim() || !bName.trim() || actionLoading}
                onClick={handleSaveBranch}
              >
                <Save size={16} /> {actionLoading ? 'Saving…' : editingBranch ? 'Update Branch' : 'Create Branch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Warehouse Modal ── */}
      {showWarehouseModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowWarehouseModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600, width: '100%', overflowX: 'hidden' }}>
            <div className="company-settings__modal-header">
              <span>{editingWarehouse ? `Edit Warehouse #${editingWarehouse.code}` : 'Add New Warehouse Location'}</span>
              <button className="company-settings__icon-btn" onClick={() => setShowWarehouseModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="company-settings__modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div className="company-settings__field">
                  <label>Warehouse Code <span>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. WH-001"
                    value={whCode}
                    onChange={(e) => setWhCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="company-settings__field">
                  <label>Warehouse Name <span>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Central Depot & Logistics Hub"
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="company-settings__field">
                  <label>Warehouse Type</label>
                  <select
                    value={whType}
                    onChange={(e) => setWhType(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-card)', color: 'var(--text-primary)', outline: 'none' }}
                  >
                    <option value="Central Warehouse">Central Warehouse</option>
                    <option value="Regional Hub">Regional Hub</option>
                    <option value="Site Store">Site Store</option>
                    <option value="Transit Center">Transit Center / Cross-Dock</option>
                  </select>
                </div>
                <div className="company-settings__field">
                  <label>City / Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Nairobi / Mumbai"
                    value={whCity}
                    onChange={(e) => setWhCity(e.target.value)}
                  />
                </div>
              </div>

              <div className="company-settings__field">
                <label>Full Shipping Address</label>
                <textarea
                  rows={2}
                  placeholder="Plot No. 12, Industrial Area, Depot Road"
                  value={whAddress}
                  onChange={(e) => setWhAddress(e.target.value)}
                />
              </div>

              <div className="company-settings__field">
                <label>Contact Manager</label>
                <input
                  type="text"
                  placeholder="Storekeeper Name"
                  value={whContactPerson}
                  onChange={(e) => setWhContactPerson(e.target.value)}
                />
              </div>

              <div className="company-settings__field" style={{ maxWidth: 320, width: '100%' }}>
                <label>Phone Number</label>
                <PhoneInput
                  countryCode={whCountryCode}
                  onCountryCodeChange={setWhCountryCode}
                  value={whPhone}
                  onChange={setWhPhone}
                  placeholder="8272811866"
                />
              </div>

              <div className="company-settings__field">
                <label>Manager Email</label>
                <input
                  type="email"
                  placeholder="warehouse@company.com"
                  value={whEmail}
                  onChange={(e) => setWhEmail(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 24, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={whIsDefault}
                    onChange={(e) => setWhIsDefault(e.target.checked)}
                  />
                  Set as Default Ship-To Location
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={whIsActive}
                    onChange={(e) => setWhIsActive(e.target.checked)}
                  />
                  Active Status
                </label>
              </div>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowWarehouseModal(false)}>
                Cancel
              </button>
              <button
                className="company-settings__btn company-settings__btn--primary"
                onClick={handleSaveWarehouse}
                disabled={actionLoading || !whCode.trim() || !whName.trim()}
              >
                <Save size={16} /> {actionLoading ? 'Saving...' : (editingWarehouse ? 'Update Warehouse' : 'Save Warehouse')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Term Modal ── */}
      {showPaymentTermModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowPaymentTermModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span>Add Payment Term</span>
              <button className="company-settings__icon-btn" onClick={() => setShowPaymentTermModal(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              {paymentTermError && (
                <div className="cs-modal-error" style={{ marginBottom: 12 }}>
                  <MessageStrip type="error" compact>{paymentTermError}</MessageStrip>
                </div>
              )}
              <div className="company-settings__field">
                <label>Payment Term Name <span>*</span></label>
                <input
                  value={paymentTermName}
                  onChange={(e) => { setPaymentTermName(e.target.value); setPaymentTermError(null); }}
                  placeholder="e.g. Net 30, Net 45, Advance"
                  className={paymentTermError ? 'cs-input--error' : ''}
                />
                <PredictiveMatchCard
                  query={paymentTermName}
                  items={paymentTerms}
                  labelName="Payment term"
                />
              </div>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowPaymentTermModal(false)}>Cancel</button>
              <button className="company-settings__btn company-settings__btn--primary" disabled={!paymentTermName.trim() || actionLoading} onClick={handleSavePaymentTerm}>
                <Save size={16} /> {actionLoading ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Category Modal ── */}
      {showCatModal && (
        <div className="company-settings__backdrop" onClick={() => !actionLoading && setShowCatModal(false)}>
          <div className="company-settings__modal" onClick={(e) => e.stopPropagation()}>
            <div className="company-settings__modal-header">
              <span><Tag size={18} /> {editingCat ? 'Edit Category' : 'Add Category'}</span>
              <button className="company-settings__icon-btn" onClick={() => setShowCatModal(false)}><X size={18} /></button>
            </div>
            <div className="company-settings__modal-body">
              {catError && (
                <div className="cs-modal-error" style={{ marginBottom: 12 }}>
                  <MessageStrip type="error" compact>{catError}</MessageStrip>
                </div>
              )}
              <div className="company-settings__field">
                <label>Department <span>*</span></label>
                <select value={catDeptId} onChange={(e) => setCatDeptId(e.target.value)}>
                  <option value="">Select department</option>
                  {departments.filter((d) => d.isActive).map((d) => (
                    <option key={d.id} value={String(d.id)}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="company-settings__field">
                <label>Category Name <span>*</span></label>
                <input
                  value={catName}
                  onChange={(e) => { setCatName(e.target.value); setCatError(null); }}
                  placeholder="e.g. Precision Tools"
                  className={catError ? 'cs-input--error' : ''}
                />
                <PredictiveMatchCard
                  query={catName}
                  items={categories.filter(c => String(c.departmentId) === String(catDeptId))}
                  excludeId={editingCat?.id}
                  labelName="Category"
                />
              </div>
              <div className="company-settings__field">
                <label>Description</label>
                <textarea value={catDesc} onChange={(e) => setCatDesc(e.target.value)} placeholder="Optional description" rows={3} />
              </div>
            </div>
            <div className="company-settings__modal-footer">
              <button className="company-settings__btn company-settings__btn--secondary" onClick={() => setShowCatModal(false)}>Cancel</button>
              <button className="company-settings__btn company-settings__btn--primary" disabled={!catName.trim() || !catDeptId || actionLoading} onClick={handleSaveCat}>
                <Save size={16} /> {actionLoading ? 'Saving…' : editingCat ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* -------------------------------------------------------
          TAB: Document Serialization
          ------------------------------------------------------- */}
      {activeTab === 'doc-serialization' && (
        <div className="cs-tab-panel" role="tabpanel">
          <div className="cs-section-card">
            <div className="cs-section-header">
              <div className="cs-section-header__left">
                <h2><Hash size={17} /> Document Serialization</h2>
                <p>
                  Configure auto-generated number formats for Supplier Codes, Purchase Orders, RFQs, Invoices, Contracts, and Payment Vouchers.
                  Changes apply to all newly created records — existing records are not affected.
                </p>
              </div>
            </div>

            <div className="cs-section-body">
              {seqLoading ? (
                <TableSkeleton rows={3} />
              ) : (
                <>
                  {seqErrMsg && (
                    <div style={{ marginBottom: '16px' }}>
                      <MessageStrip type="error" onClose={() => setSeqErrMsg(null)}>
                        {seqErrMsg}
                      </MessageStrip>
                    </div>
                  )}

                  <div className="cs-seq-grid">
                    {(['SUPPLIER_CODE', 'PURCHASE_ORDER', 'RFQ', 'INVOICE', 'CONTRACT', 'PAYMENT_VOUCHER'] as const).map((entityType) => {
                      const meta = ENTITY_LABELS[entityType] ?? { label: entityType, desc: '' };
                      const edit = seqEdits[entityType] ?? {};
                      const isSaving = seqSaving === entityType;
                      const preview = getSeqPreview(entityType);
                      const isLoaded = sequences.some(s => s.entityType === entityType);

                      return (
                        <div key={entityType} className="cs-seq-card">
                          {/* Card Header */}
                          <div className="cs-seq-card__header">
                            <div className="cs-seq-card__title-row">
                              <Hash size={14} className="cs-seq-card__icon" />
                              <span className="cs-seq-card__title">{meta.label}</span>
                              <span className="cs-seq-card__badge">{entityType}</span>
                            </div>
                            <p className="cs-seq-card__desc">{meta.desc}</p>
                          </div>

                          {/* Live Preview */}
                          <div className="cs-seq-preview">
                            <span className="cs-seq-preview__label">Live Preview</span>
                            <span className="cs-seq-preview__value">{isLoaded ? preview : '—'}</span>
                          </div>

                          {/* Form Fields */}
                          <div className="cs-seq-fields">
                            <div className="cs-seq-field-row">
                              <div className="cs-seq-field">
                                <label className="cs-seq-label">Prefix</label>
                                <input
                                  className="cs-seq-input"
                                  type="text"
                                  placeholder="e.g. PO-{YYYY}-"
                                  value={String(edit.prefix ?? '')}
                                  onChange={(e) => handleSeqFieldChange(entityType, 'prefix', e.target.value)}
                                />
                              </div>
                              <div className="cs-seq-field">
                                <label className="cs-seq-label">Suffix <span className="cs-seq-optional">(optional)</span></label>
                                <input
                                  className="cs-seq-input"
                                  type="text"
                                  placeholder="e.g. -{YYYY}"
                                  value={String(edit.suffix ?? '')}
                                  onChange={(e) => handleSeqFieldChange(entityType, 'suffix', e.target.value)}
                                />
                              </div>
                            </div>

                            {/* Clickable placeholder tokens */}
                            {(() => {
                              const now = new Date();
                              const tokens = [
                                { token: '{YYYY}', label: '4-digit Year', example: String(now.getFullYear()) },
                                { token: '{YY}',   label: '2-digit Year', example: String(now.getFullYear()).slice(-2) },
                                { token: '{MM}',   label: 'Month',        example: String(now.getMonth() + 1).padStart(2, '0') },
                                { token: '{DD}',   label: 'Day',          example: String(now.getDate()).padStart(2, '0') },
                              ];
                              return (
                                <div className="cs-seq-token-hint">
                                  <span className="cs-seq-token-hint__label">Click to add to Prefix:</span>
                                  {tokens.map(({ token, label, example }) => (
                                    <button
                                      key={token}
                                      type="button"
                                      className="cs-seq-token cs-seq-token--btn"
                                      title={`${label} → inserts "${example}" when generating codes`}
                                      onClick={() => handleSeqFieldChange(
                                        entityType,
                                        'prefix',
                                        String((seqEdits[entityType]?.prefix ?? '')) + token
                                      )}
                                    >
                                      {token}
                                      <span className="cs-seq-token__eg">= {example}</span>
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}


                            <div className="cs-seq-field-row">
                              <div className="cs-seq-field">
                                <label className="cs-seq-label">Digit Padding</label>
                                <select
                                  className="cs-seq-input"
                                  value={Number(edit.paddingLength ?? 4)}
                                  onChange={(e) => handleSeqFieldChange(entityType, 'paddingLength', Number(e.target.value))}
                                >
                                  <option value={3}>3 digits (001)</option>
                                  <option value={4}>4 digits (0001)</option>
                                  <option value={5}>5 digits (00001)</option>
                                  <option value={6}>6 digits (000001)</option>
                                </select>
                              </div>
                              <div className="cs-seq-field">
                                <label className="cs-seq-label">Reset Frequency</label>
                                <select
                                  className="cs-seq-input"
                                  value={String(edit.resetFrequency ?? 'NEVER')}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleSeqFieldChange(entityType, 'resetFrequency', val);
                                    if (val === 'YEARLY' || val === 'FISCAL_YEAR') {
                                      setFyModalEntity(entityType);
                                    }
                                  }}
                                >
                                  <option value="NEVER">Never Reset</option>
                                  <option value="YEARLY">Reset Yearly / Financial Year (Custom Dates)</option>
                                  <option value="MONTHLY">Reset Monthly</option>
                                </select>
                              </div>
                            </div>

                            {/* Financial Year / Sequence Period Start & End Dates Badge Trigger */}
                            {(edit.resetFrequency === 'YEARLY' || edit.resetFrequency === 'FISCAL_YEAR' || edit.resetFrequency === 'CUSTOM_PERIOD') && (
                              <div style={{ marginTop: '2px', marginBottom: '6px' }}>
                                <button
                                  type="button"
                                  className="cs-fy-chip-badge"
                                  onClick={() => setFyModalEntity(entityType)}
                                >
                                  <Calendar size={14} />
                                  <span>
                                    {edit.periodStartDate && edit.periodEndDate
                                      ? `${edit.periodStartDate} → ${edit.periodEndDate}`
                                      : 'Configure Financial Year Dates (Open/Close)'}
                                  </span>
                                  <Settings size={12} style={{ opacity: 0.8 }} />
                                </button>
                              </div>
                            )}

                            <div className="cs-seq-field-row">
                              <div className="cs-seq-field cs-seq-field--full">
                                <label className="cs-seq-label">
                                  Next Counter Number
                                  <span className="cs-seq-optional"> (next record will use this number)</span>
                                </label>
                                <input
                                  className="cs-seq-input"
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={Number(edit.nextNumber ?? 1)}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const parsed = parseInt(e.target.value, 10);
                                    handleSeqFieldChange(entityType, 'nextNumber', isNaN(parsed) ? 1 : Math.max(1, parsed));
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Save Button */}
                          <div className="cs-seq-card__footer">
                            <button
                              className="company-settings__btn company-settings__btn--primary cs-seq-save-btn"
                              disabled={isSaving || !isLoaded}
                              onClick={() => handleSeqSave(entityType)}
                            >
                              {isSaving ? (
                                <><Loader2 size={14} className="cs-spin" /> Saving…</>
                              ) : (
                                <><Save size={14} /> Save {meta.label}</>
                              )}
                            </button>

                            {/* Backfill button — only for Supplier Code */}
                            {entityType === 'SUPPLIER_CODE' && (
                              <button
                                className="company-settings__btn company-settings__btn--primary"
                                disabled={isBackfilling}
                                onClick={handleBackfillSuppliers}
                                title="Assign sequential supplier codes to all existing vendors who don't have one"
                              >
                                {isBackfilling ? (
                                  <><Loader2 size={14} className="cs-spin" /> Assigning…</>
                                ) : (
                                  <>Assign Existing Vendors</>
                                )}
                              </button>
                            )}

                            {/* Backfill success handled by modal */}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Info Note */}
                  <div className="cs-seq-note">
                    <Info size={14} />
                    <span>
                      Changing <strong>Next Counter Number</strong> does not affect existing records.
                      Yearly/Monthly reset automatically resets the counter on the first day of the period.
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ── Document Serialization: Save Success Modal ── */}
      {seqSuccessInfo && (
        <div
          className="cs-seq-success-backdrop"
          onClick={() => setSeqSuccessInfo(null)}
          role="presentation"
        >
          <div
            className="cs-seq-success-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Icon */}
            <div className="cs-seq-success-modal__icon-wrap">
              <CheckCircle2 size={40} className="cs-seq-success-modal__icon" />
            </div>

            {/* Heading */}
            <h2 className="cs-seq-success-modal__title">Sequence Saved</h2>
            <p className="cs-seq-success-modal__subtitle">
              <strong>{seqSuccessInfo.label}</strong> settings have been updated successfully.
            </p>

            {/* Preview pill */}
            <div className="cs-seq-success-modal__preview-box">
              <span className="cs-seq-success-modal__preview-label">Next Generated Code</span>
              <span className="cs-seq-success-modal__preview-val">{seqSuccessInfo.preview}</span>
            </div>

            {/* OK button */}
            <button
              className="cs-seq-success-modal__ok"
              onClick={() => setSeqSuccessInfo(null)}
              autoFocus
            >
              OK
            </button>
          </div>
        </div>
      )}


      {cropFile && (
        <ImageCropperModal
          file={cropFile}
          cropAspectWidth={1}
          cropAspectHeight={1}
          onCrop={handleCropAndUpload}
          onClose={() => setCropFile(null)}
        />
      )}



      {/* ── Passcode Configuration Modal ── */}
      {/* ── Passcode Configuration Modal ── */}
      {showPasscodeModal && (
        <div className="cs-passcode-modal-backdrop" onClick={() => setShowPasscodeModal(false)}>
          <div className="cs-passcode-modal-box" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="cs-passcode-modal-header">
              <div className="cs-passcode-modal-header__title">
                <div className="cs-passcode-modal-header__icon">
                  <Lock size={20} />
                </div>
                <div className="cs-passcode-modal-header__text">
                  <h3>
                    {passcodeModalMode === 'set' && 'Set Security Passcode'}
                    {passcodeModalMode === 'change' && 'Change Security Passcode'}
                    {passcodeModalMode === 'remove' && 'Disable Passcode Protection'}
                  </h3>
                  <p>
                    {passcodeModalMode === 'set' && 'Protect Company Settings from unauthorized access'}
                    {passcodeModalMode === 'change' && 'Update your existing Company Settings passcode'}
                    {passcodeModalMode === 'remove' && 'Remove security lock from Company Settings'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="cs-passcode-modal-close"
                onClick={() => setShowPasscodeModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="cs-passcode-modal-body">
              {passcodeError && (
                <MessageStrip type="error" compact>
                  {passcodeError}
                </MessageStrip>
              )}

              {passcodeModalMode === 'remove' ? (
                <p style={{ margin: 0, fontSize: 14.5, color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6 }}>
                  Are you sure you want to disable passcode protection? Anyone with Admin permissions will be able to access Company Settings directly without entering a passcode.
                </p>
              ) : null}

              {isPasscodeProtected && (passcodeModalMode === 'change' || passcodeModalMode === 'remove') && (
                <div className="cs-passcode-input-group">
                  <label className="cs-passcode-label">
                    Current Security Passcode <span className="cs-passcode-label__req">*</span>
                  </label>
                  <div className="cs-passcode-input-wrapper">
                    <input
                      type={showCurrentPasscodeText ? 'text' : 'password'}
                      className="cs-passcode-input"
                      placeholder="Enter current passcode"
                      value={passcodeCurrent}
                      onChange={(e) => setPasscodeCurrent(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="cs-passcode-toggle-btn"
                      onClick={() => setShowCurrentPasscodeText(!showCurrentPasscodeText)}
                      tabIndex={-1}
                    >
                      {showCurrentPasscodeText ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {passcodeModalMode !== 'remove' && (
                <>
                  <div className="cs-passcode-input-group">
                    <label className="cs-passcode-label">
                      New Security Passcode <span className="cs-passcode-label__req">*</span>
                    </label>
                    <div className="cs-passcode-input-wrapper">
                      <input
                        type={showPasscodeText ? 'text' : 'password'}
                        className="cs-passcode-input"
                        placeholder="Min 4 characters"
                        value={passcodeNew}
                        onChange={(e) => setPasscodeNew(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="cs-passcode-toggle-btn"
                        onClick={() => setShowPasscodeText(!showPasscodeText)}
                        tabIndex={-1}
                      >
                        {showPasscodeText ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="cs-passcode-input-group">
                    <label className="cs-passcode-label">
                      Confirm New Security Passcode <span className="cs-passcode-label__req">*</span>
                    </label>
                    <div className="cs-passcode-input-wrapper">
                      <input
                        type={showPasscodeText ? 'text' : 'password'}
                        className="cs-passcode-input"
                        placeholder="Re-enter new passcode"
                        value={passcodeConfirm}
                        onChange={(e) => setPasscodeConfirm(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="cs-passcode-modal-footer">
              <button
                type="button"
                className="cs-passcode-btn-cancel"
                onClick={() => setShowPasscodeModal(false)}
                disabled={passcodeSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`cs-passcode-btn-submit ${passcodeModalMode === 'remove' ? 'cs-passcode-btn-submit--danger' : ''}`}
                onClick={handleSavePasscode}
                disabled={passcodeSaving}
              >
                {passcodeSaving ? (
                  <span>Saving…</span>
                ) : (
                  <>
                    <Check size={16} />
                    <span>
                      {passcodeModalMode === 'set' && 'Set Passcode'}
                      {passcodeModalMode === 'change' && 'Update Passcode'}
                      {passcodeModalMode === 'remove' && 'Disable Passcode'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Financial Year Configuration Modal ── */}
      {fyModalEntity && (() => {
        const entityType = fyModalEntity;
        const meta = ENTITY_LABELS[entityType] ?? { label: entityType, desc: '' };
        const edit = seqEdits[entityType] ?? {};
        const startDate = String(edit.periodStartDate ?? '');
        const endDate = String(edit.periodEndDate ?? '');
        const yr = new Date().getFullYear();

        return (
          <div className="cs-fy-modal-backdrop" onClick={() => setFyModalEntity(null)}>
            <div className="cs-fy-modal-box" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="cs-fy-modal-header">
                <div className="cs-fy-modal-header__title">
                  <div className="cs-fy-modal-header__icon">
                    <Calendar size={22} />
                  </div>
                  <div className="cs-fy-modal-header__text">
                    <h3>Financial Year & Sequence Dates</h3>
                    <p>Configure open & close dates for {meta.label} sequence reset</p>
                  </div>
                </div>
                <button className="cs-passcode-modal-close" onClick={() => setFyModalEntity(null)}>
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="cs-fy-modal-body">
                {/* Preset Cards */}
                <div>
                  <label className="cs-fy-section-label">
                    Quick Select Regional Financial Year
                  </label>
                  <div className="cs-fy-preset-grid">
                    {/* Apr - Mar */}
                    <div
                      className={`cs-fy-preset-card ${startDate === `${yr}-04-01` && endDate === `${yr + 1}-03-31` ? 'cs-fy-preset-card--active' : ''}`}
                      onClick={() => {
                        handleSeqFieldChange(entityType, 'periodStartDate', `${yr}-04-01`);
                        handleSeqFieldChange(entityType, 'periodEndDate', `${yr + 1}-03-31`);
                      }}
                    >
                      <div className="cs-fy-preset-title">🇮🇳 🇬🇧 Apr 01 – Mar 31</div>
                      <div className="cs-fy-preset-dates">{yr}-04-01 → {yr + 1}-03-31</div>
                      <div className="cs-fy-preset-region">India, UK, South Africa, Japan</div>
                    </div>

                    {/* Jan - Dec */}
                    <div
                      className={`cs-fy-preset-card ${startDate === `${yr}-01-01` && endDate === `${yr}-12-31` ? 'cs-fy-preset-card--active' : ''}`}
                      onClick={() => {
                        handleSeqFieldChange(entityType, 'periodStartDate', `${yr}-01-01`);
                        handleSeqFieldChange(entityType, 'periodEndDate', `${yr}-12-31`);
                      }}
                    >
                      <div className="cs-fy-preset-title">🌐 Jan 01 – Dec 31</div>
                      <div className="cs-fy-preset-dates">{yr}-01-01 → {yr}-12-31</div>
                      <div className="cs-fy-preset-region">Calendar Year / Global Standard</div>
                    </div>

                    {/* Oct - Sep */}
                    <div
                      className={`cs-fy-preset-card ${startDate === `${yr}-10-01` && endDate === `${yr + 1}-09-30` ? 'cs-fy-preset-card--active' : ''}`}
                      onClick={() => {
                        handleSeqFieldChange(entityType, 'periodStartDate', `${yr}-10-01`);
                        handleSeqFieldChange(entityType, 'periodEndDate', `${yr + 1}-09-30`);
                      }}
                    >
                      <div className="cs-fy-preset-title">🇺🇸 Oct 01 – Sep 30</div>
                      <div className="cs-fy-preset-dates">{yr}-10-01 → {yr + 1}-09-30</div>
                      <div className="cs-fy-preset-region">US Federal & Institutional FY</div>
                    </div>

                    {/* Jul - Jun */}
                    <div
                      className={`cs-fy-preset-card ${startDate === `${yr}-07-01` && endDate === `${yr + 1}-06-30` ? 'cs-fy-preset-card--active' : ''}`}
                      onClick={() => {
                        handleSeqFieldChange(entityType, 'periodStartDate', `${yr}-07-01`);
                        handleSeqFieldChange(entityType, 'periodEndDate', `${yr + 1}-06-30`);
                      }}
                    >
                      <div className="cs-fy-preset-title">🇦🇺 🇰🇪 Jul 01 – Jun 30</div>
                      <div className="cs-fy-preset-dates">{yr}-07-01 → {yr + 1}-06-30</div>
                      <div className="cs-fy-preset-region">Australia, Kenya, Egypt, NZ</div>
                    </div>
                  </div>
                </div>

                {/* Custom Date Pickers */}
                <div className="cs-fy-date-row">
                  <div className="cs-fy-date-field">
                    <label>Sequence Open Date (Start)</label>
                    <input
                      type="date"
                      className="cs-fy-date-input"
                      value={startDate}
                      onChange={(e) => handleSeqFieldChange(entityType, 'periodStartDate', e.target.value)}
                    />
                  </div>
                  <div className="cs-fy-date-field">
                    <label>Sequence Close Date (End)</label>
                    <input
                      type="date"
                      className="cs-fy-date-input"
                      value={endDate}
                      onChange={(e) => handleSeqFieldChange(entityType, 'periodEndDate', e.target.value)}
                    />
                  </div>
                </div>

                {/* Summary Banner */}
                <div className="cs-fy-summary-banner">
                  <Info size={18} style={{ color: '#38bdf8', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    Active sequence period: <strong>{startDate || 'Not Set'}</strong> to <strong>{endDate || 'Not Set'}</strong>.
                    Document serial counter resets to <strong>#0001</strong> as soon as this sequence period closes.
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="cs-fy-modal-footer">
                <button
                  type="button"
                  className="company-settings__btn company-settings__btn--secondary"
                  onClick={() => setFyModalEntity(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="company-settings__btn company-settings__btn--primary"
                  onClick={() => setFyModalEntity(null)}
                >
                  <Check size={16} /> Apply & Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
