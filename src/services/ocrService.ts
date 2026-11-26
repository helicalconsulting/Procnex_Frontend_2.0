/**
 * OCR Service for extracting dates and issuing authorities from uploaded documents
 * (Emirates ID, Trade License, VAT / Tax Certificates, Passports, Driving Licenses, etc.)
 */
import { API_BASE } from '../api/client';

export interface ExtractedDocumentDates {
  documentType?: string;
  issueDate?: string;       // Formatted as YYYY-MM-DD
  expirationDate?: string;  // Formatted as YYYY-MM-DD
  issuingAuthority?: string;
  registrationNumber?: string;
  taxNumber?: string;
  taxValidationStatus?: 'VERIFIED' | 'AUTO_REPAIRED' | 'UNVERIFIED';
  taxStandard?: string;
  emiratesIdNumber?: string;
  companyName?: string;
  arabicCompanyName?: string;
  legalEntityType?: string;
  capitalAmount?: string;
  authorizedSignatory?: string;
  iban?: string;
  swiftCode?: string;
  hijriIssueDate?: string;
  hijriExpirationDate?: string;
  healthStatus?: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'PERPETUAL' | 'UNKNOWN';
  daysToExpiry?: number;
  healthMessage?: string;
  avgConfidence?: number;
  llmEscalated?: boolean;
  llmProvider?: string;
  qrData?: Record<string, any>;
  rawText: string;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
};

export function toWesternDigits(str: string): string {
  if (!str) return '';
  const arabicEasternMap: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  };
  return str.replace(/[٠-٩۰-۹]/g, (ch) => arabicEasternMap[ch] || ch);
}

/**
 * Umm al-Qura astronomical algorithm for converting Hijri calendar dates (hy, hm, hd)
 * to Gregorian ISO date (YYYY-MM-DD).
 */
export function hijriToGregorian(hy: number, hm: number, hd: number): { year: number; month: number; day: number; iso: string } {
  const jd = Math.floor((11 * hy + 3) / 30) + 354 * hy + 30 * hm - Math.floor((hm - 1) / 2) + hd + 1948440 - 385;
  let l = jd + 68569;
  const n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n - 49) + i + l;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, iso };
}

/**
 * Standardize any matched date string into YYYY-MM-DD for HTML <input type="date">
 */
export function normalizeDateToISO(dateStr: string): string | null {
  if (!dateStr) return null;
  let cleaned = toWesternDigits(dateStr).trim().replace(/[,\.]/g, ' ');
  // Strip ordinal suffixes (e.g. 23rd October 2018 -> 23 October 2018)
  cleaned = cleaned.replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1');
  // Collapse whitespace inside date e.g. "12 / 05 / 2024" -> "12/05/2024"
  cleaned = cleaned.replace(/\s*([-\/\.])\s*/g, '$1');

  // 1. Hijri Format: YYYY/MM/DD or YYYY-MM-DD (e.g. 1442/08/20 or 1445-05-12)
  const hijriYmd = cleaned.match(/\b(14\d\d)[-\/\.](0?[1-9]|1[0-2])[-\/\.](0?[1-9]|[12]\d|30)\b/);
  if (hijriYmd) {
    const hy = parseInt(hijriYmd[1], 10);
    const hm = parseInt(hijriYmd[2], 10);
    const hd = parseInt(hijriYmd[3], 10);
    return hijriToGregorian(hy, hm, hd).iso;
  }

  // 1b. Hijri Format: DD/MM/YYYY or DD-MM-YYYY (e.g. 20/08/1442 or 12-05-1445)
  const hijriDmy = cleaned.match(/\b(0?[1-9]|[12]\d|30)[-\/\.](0?[1-9]|1[0-2])[-\/\.](14\d\d)\b/);
  if (hijriDmy) {
    const hd = parseInt(hijriDmy[1], 10);
    const hm = parseInt(hijriDmy[2], 10);
    const hy = parseInt(hijriDmy[3], 10);
    return hijriToGregorian(hy, hm, hd).iso;
  }

  // 2. Format: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const ymd = cleaned.match(/\b(19\d\d|20\d\d)[-\/\.](0?[1-9]|1[0-2])[-\/\.](0?[1-9]|[12]\d|3[01])\b/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 3. Format: DD-Mon-YYYY or DD Mon YYYY or DD/Mon/YYYY (e.g., 15 Oct 2028 or 15-OCT-2028 or 15 October 2028)
  const dMonY = cleaned.match(/\b(0?[1-9]|[12]\d|3[01])[-\/\s]([A-Za-z]{3,9})[-\/\s](19\d\d|20\d\d)\b/i);
  if (dMonY) {
    const d = dMonY[1].padStart(2, '0');
    const monStr = dMonY[2].toLowerCase();
    const m = MONTH_MAP[monStr] || MONTH_MAP[monStr.slice(0, 3)];
    const y = dMonY[3];
    if (m) return `${y}-${m}-${d}`;
  }

  // 3b. Format: Mon DD, YYYY or Mon DD YYYY (e.g., October 15, 2028 or Oct 15 2028)
  const monDY = cleaned.match(/\b([A-Za-z]{3,9})[-\/\s](0?[1-9]|[12]\d|3[01])[-\/\s,]+(19\d\d|20\d\d)\b/i);
  if (monDY) {
    const monStr = monDY[1].toLowerCase();
    const m = MONTH_MAP[monStr] || MONTH_MAP[monStr.slice(0, 3)];
    const d = monDY[2].padStart(2, '0');
    const y = monDY[3];
    if (m) return `${y}-${m}-${d}`;
  }

  // 4. Format: Numeric separator date (DD/MM/YYYY or MM/DD/YYYY or DD.MM.YYYY)
  const numDate = cleaned.match(/\b(0?[1-9]|[12]\d|3[01])[-\/\.](0?[1-9]|[12]\d|3[01])[-\/\.](19\d\d|20\d\d)\b/);
  if (numDate) {
    const p1 = parseInt(numDate[1], 10);
    const p2 = parseInt(numDate[2], 10);
    const y = numDate[3];

    // If p1 > 12, p1 must be day and p2 must be month (DD/MM/YYYY)
    if (p1 > 12 && p2 <= 12) {
      return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    // If p2 > 12, p2 must be day and p1 must be month (MM/DD/YYYY)
    if (p2 > 12 && p1 <= 12) {
      return `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
    // Default in UAE / GCC / International documents is DD/MM/YYYY
    return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Analyzes extracted text lines to locate Date of Issue & Date of Expiration & Issuing Authority.
 */
export function parseDocumentDates(text: string): ExtractedDocumentDates {
  const normalizedText = toWesternDigits(text);
  const lines = normalizedText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // ── Global Multi-Lingual Keywords ──
  const issueKeywords = /(?:issuing\s*date|date\s*of\s*issue|issue\s*date|issued\s*on|registration\s*date|registered\s*on|date\s*of\s*registration|effective\s*date|commencement\s*date|start\s*date|valid\s*from|valid\s*since|incorporation\s*date|date\s*of\s*incorporation|date\s*of\s*allotment|date\s*of\s*grant|date\s*of\s*entry|license\s*date|certificate\s*date|executed\s*on|given\s*under\s*my\s*hand|dated|doi\b|admission\s*date|enrolment\s*date|establishment\s*date|creation\s*date|تاريخ\s*الإصدار|تاريخ\s*الاصدار|تاريخ\s*التسجيل|تاريخ\s*سريان|تاريخ\s*بدء|تاريخ\s*البدء|تاريخ\s*التأسيس|تاريخ\s*القيد|تحريرا\s*في|صدرت\s*بتاريخ|حرر\s*في|بداية\s*الترخيص|تاريخ\s*المنح|تاريخ\s*الإنشاء|date\s*d['’]émission|date\s*d['’]emission|date\s*de\s*délivrance|date\s*d['’]enregistrement|date\s*d['’]effet|fecha\s*de\s*emisión|fecha\s*de\s*emision|fecha\s*de\s*expedición|fecha\s*de\s*registro|ausstellungsdatum|registrierungsdatum)/i;

  const expiryKeywords = /(?:date\s*of\s*expir\w*|expiry\s*date|expiration\s*date|expires\s*on|valid\s*until|valid\s*thru|valid\s*through|valid\s*upto|valid\s*up\s*to|valid\s*to|valid\s*till|validity\s*period|period\s*of\s*validity|validity|end\s*date|termination\s*date|renewal\s*date|renewable\s*before|good\s*through|due\s*date|deadline|expiry\b|expir\w*|exp\b|doe\b|تاريخ\s*الانتهاء|تاريخ\s*الإنتهاء|انتهاء\s*الصلاحية|نهاية\s*الترخيص|صالحة\s*لغاية|صالح\s*حتى|تاريخ\s*النفاذ|ينتهي\s*في|ينتهي\s*بتاريخ|صلاحية\s*الشهادة|تاريخ\s*انتهاء|صلاحية|date\s*d['’]expiration|date\s*d['’]échéance|valable\s*jusqu['’]au|fecha\s*de\s*vencimiento|fecha\s*de\s*expiración|válido\s*hasta|ablaufdatum|gültig\s*bis|gueltig\s*bis)/i;

  const perpetualKeywords = /(?:non[-\s]expiring|perpetual|indefinite|until\s*cancelled|lifetime|no\s*expiry|مستمر|غير\s*محدد|دائم)/i;
  const isPerpetual = perpetualKeywords.test(normalizedText);

  // DOB pattern to strictly protect against treating Birth Date as Issue Date
  const birthKeywords = /(?:date\s*of\s*birth|birth\s*date|dob\b|born\s*on|تاريخ\s*الميلاد|date\s*de\s*naissance|fecha\s*de\s*nacimiento|geburtsdatum)/i;
  const anyDateRegex = /(?:\b\d{1,2}\s*[-\/\.]\s*\d{1,2}\s*[-\/\.]\s*\d{4}\b|\b\d{4}\s*[-\/\.]\s*\d{1,2}\s*[-\/\.]\s*\d{1,2}\b|\b\d{1,2}\s*[-\/\s]\s*[A-Za-z]{3,9}\s*[-\/\s]\s*\d{4}\b)/g;

  let issueDate: string | undefined;
  let expirationDate: string | undefined;
  let issuingAuthority: string | undefined;

  // 1. Direct inline extraction for adjacent label + date e.g. "Issue Date: 12/05/2023" or "تاريخ الإصدار 2023/05/12"
  const inlineDatePattern = '(?:\\b(?:19\\d\\d|20\\d\\d)\\s*[-\\/\\.]\\s*(?:1[0-2]|0?[1-9])\\s*[-\\/\\.]\\s*(?:[12]\\d|3[01]|0?[1-9])\\b|\\b(?:[12]\\d|3[01]|0?[1-9])\\s*[-\\/\\.]\\s*(?:1[0-2]|0?[1-9])\\s*[-\\/\\.]\\s*(?:19\\d\\d|20\\d\\d)\\b|\\b(?:[12]\\d|3[01]|0?[1-9])\\s*[-\\/\\s]\\s*[A-Za-z]{3,9}\\s*[-\\/\\s]\\s*(?:19\\d\\d|20\\d\\d)\\b)';
  const inlineIssuePattern = new RegExp('(?:date\\s*of\\s*issue|issue\\s*date|issued\\s*on|registration\\s*date|effective\\s*date|commencement\\s*date|valid\\s*from|valid\\s*since|start\\s*date|doi\b|incorporation\\s*date|تاريخ\\s*الإصدار|تاريخ\s*الاصدار|تاريخ\\s*التسجيل|تاريخ\\s*سريان|تاريخ\\s*البدء|date\\s*d[\'’]émission|fecha\\s*de\\s*emisión|ausstellungsdatum)[^\\d\\n\\r]{0,35}(' + inlineDatePattern + ')', 'i');
  const inlineExpiryPattern = new RegExp('(?:date\\s*of\\s*expir\\w*|expiry\\s*date|expiration\\s*date|expires\\s*on|valid\\s*until|valid\\s*thru|valid\\s*through|valid\\s*upto|valid\\s*up\\s*to|valid\\s*to|valid\\s*till|validity|deadline|due\\s*date|end\\s*date|termination\\s*date|expiry\\b|expir\\w*|doe\\b|تاريخ\\s*الانتهاء|تاريخ\\s*الإنتهاء|انتهاء\\s*الصلاحية|نهاية\\s*الترخيص|صالحة\\s*لغاية|صالح\\s*حتى|تاريخ\\s*النفاذ|date\\s*d[\'’]expiration|valable\\s*jusqu[\'’]au|fecha\\s*de\\s*vencimiento|ablaufdatum|gültig\\s*bis)[^\\d\\n\\r]{0,35}(' + inlineDatePattern + ')', 'i');

  const inlineIssueMatch = normalizedText.match(inlineIssuePattern);
  if (inlineIssueMatch && inlineIssueMatch[1]) {
    const iso = normalizeDateToISO(inlineIssueMatch[1]);
    if (iso) issueDate = iso;
  }

  if (!isPerpetual) {
    const inlineExpiryMatch = normalizedText.match(inlineExpiryPattern);
    if (inlineExpiryMatch && inlineExpiryMatch[1]) {
      const iso = normalizeDateToISO(inlineExpiryMatch[1]);
      if (iso) expirationDate = iso;
    }
  }

  // 2. Line-by-line scanning with proximity & same-line disambiguation
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check Issue Date (ensure not a Birth Date line)
    if (!issueDate && issueKeywords.test(line) && !birthKeywords.test(line)) {
      if (expiryKeywords.test(line)) {
        const issueIdx = line.search(issueKeywords);
        const expiryIdx = line.search(expiryKeywords);
        const sub = issueIdx < expiryIdx ? line.substring(issueIdx, expiryIdx) : line.substring(issueIdx);
        const subMatch = sub.match(anyDateRegex);
        if (subMatch && subMatch[0]) {
          const iso = normalizeDateToISO(subMatch[0]);
          if (iso) issueDate = iso;
        }
      }

      if (!issueDate) {
        for (let offset = 0; offset <= 3 && i + offset < lines.length; offset++) {
          const candidateLine = lines[i + offset];
          if (offset > 0 && (birthKeywords.test(candidateLine) || expiryKeywords.test(candidateLine))) break;
          const matchInLine = candidateLine.match(anyDateRegex);
          if (matchInLine && matchInLine[0]) {
            const iso = normalizeDateToISO(matchInLine[0]);
            if (iso) {
              issueDate = iso;
              break;
            }
          }
        }
      }
    }

    // Check Expiration Date (only if not perpetual)
    if (!isPerpetual && !expirationDate && expiryKeywords.test(line)) {
      if (issueKeywords.test(line)) {
        const issueIdx = line.search(issueKeywords);
        const expiryIdx = line.search(expiryKeywords);
        const sub = expiryIdx < issueIdx ? line.substring(expiryIdx, issueIdx) : line.substring(expiryIdx);
        const subMatch = sub.match(anyDateRegex);
        if (subMatch && subMatch[0]) {
          const iso = normalizeDateToISO(subMatch[0]);
          if (iso) expirationDate = iso;
        }
      }

      if (!expirationDate) {
        for (let offset = 0; offset <= 3 && i + offset < lines.length; offset++) {
          const candidateLine = lines[i + offset];
          if (offset > 0 && (birthKeywords.test(candidateLine) || issueKeywords.test(candidateLine))) break;
          const matchInLine = candidateLine.match(anyDateRegex);
          if (matchInLine && matchInLine[0]) {
            const iso = normalizeDateToISO(matchInLine[0]);
            if (iso) {
              expirationDate = iso;
              break;
            }
          }
        }
      }
    }

    // ── Check Issuing Authority Line-by-Line ──
    if (!issuingAuthority) {
      // A. Explicit Label Extraction e.g. "Issuing Authority: Dubai Silicon Oasis Authority"
      const explicitAuthMatch = line.match(/(?:issuing\s*authority|licensing\s*authority|issued\s*by|issuer|sanctioning\s*authority|competent\s*authority|certified\s*by|جهة\s*الإصدار|الجهة\s*المصدرة|سلطة\s*الترخيص|صادر\s*عن|délivré\s*par|ausstellende\s*behörde)\s*[:\-–]\s*([A-Za-z\u0600-\u06FF\s,\.\-&]{3,80})/i);
      if (explicitAuthMatch && explicitAuthMatch[1]) {
        const candidate = explicitAuthMatch[1].trim().replace(/[\r\n\t]+/g, ' ').replace(/[;,\.]$/, '');
        if (candidate.length >= 3 && !/^(n\/?a|nil|none|yes|no)$/i.test(candidate)) {
          issuingAuthority = candidate;
        }
      }

      // B. UAE & GCC Authorities
      if (!issuingAuthority) {
        if (/EMIRATES\s+ID|IDENTITY\s+CARD|FEDERAL\s+AUTHORITY\s+FOR\s+IDENTITY/i.test(line) || /\bICP\b|\bEIDA\b|الهيئة\s+الاتحادية\s+للهوية/i.test(line)) {
          issuingAuthority = 'Federal Authority for Identity, Citizenship, Customs & Port Security (ICP)';
        } else if (/FEDERAL\s+TAX\s+AUTHORITY|TAX\s+REGISTRATION|\bFTA\b|الهيئة\s+الاتحادية\s+للضرائب/i.test(line)) {
          issuingAuthority = 'Federal Tax Authority (FTA)';
        } else if (/DEPARTMENT\s+OF\s+ECONOMIC|ECONOMY\s+AND\s+TOURISM|\bDED\b|\bDET\b|اقتصادية\s+دبي|دائرة\s+الاقتصاد/i.test(line)) {
          issuingAuthority = 'Department of Economy and Tourism (DET / DED)';
        } else if (/ABU\s+DHABI\s+DEPARTMENT\s+OF\s+ECONOMIC|\bADDED\b|اقتصادية\s+أبوظبي|اقتصادية\s+ابوظبي/i.test(line)) {
          issuingAuthority = 'Abu Dhabi Department of Economic Development (ADDED)';
        } else if (/SHARJAH\s+ECONOMIC\s+DEVELOPMENT|\bSEDD\b|اقتصادية\s+الشارقة/i.test(line)) {
          issuingAuthority = 'Sharjah Economic Development Department (SEDD)';
        } else if (/AJMAN\s+(?:DED|DEPARTMENT\s+OF\s+ECONOMIC)|اقتصادية\s+عجمان/i.test(line)) {
          issuingAuthority = 'Ajman Department of Economic Development';
        } else if (/RAK\s+DEPARTMENT\s+OF\s+ECONOMIC|اقتصادية\s+رأس\s+الخيمة/i.test(line)) {
          issuingAuthority = 'Ras Al Khaimah Department of Economic Development';
        } else if (/FUJAIRAH\s+MUNICIPALITY|بلدية\s+الفجيرة/i.test(line)) {
          issuingAuthority = 'Fujairah Municipality';
        } else if (/MINISTRY\s+OF\s+FINANCE|وزارة\s+المالية/i.test(line)) {
          issuingAuthority = 'Ministry of Finance';
        } else if (/MINISTRY\s+OF\s+ECONOMY|وزارة\s+الاقتصاد/i.test(line)) {
          issuingAuthority = 'Ministry of Economy';
        } else if (/\bDMCC\b|DUBAI\s+MULTI\s+COMMODITIES/i.test(line)) {
          issuingAuthority = 'Dubai Multi Commodities Centre (DMCC)';
        } else if (/\bDIFC\b|DUBAI\s+INTERNATIONAL\s+FINANCIAL/i.test(line)) {
          issuingAuthority = 'Dubai International Financial Centre (DIFC)';
        } else if (/\bJAFZA\b|JEBEL\s+ALI\s+FREE\s+ZONE/i.test(line)) {
          issuingAuthority = 'Jebel Ali Free Zone Authority (JAFZA)';
        } else if (/\bDAFZA\b|DUBAI\s+AIRPORT\s+FREEZONE/i.test(line)) {
          issuingAuthority = 'Dubai Airport Freezone Authority (DAFZA)';
        } else if (/\bRAKEZ\b|RAS\s+AL\s+KHAIMAH\s+ECONOMIC\s+ZONE/i.test(line)) {
          issuingAuthority = 'Ras Al Khaimah Economic Zone (RAKEZ)';
        } else if (/\bADGM\b|ABU\s+DHABI\s+GLOBAL\s+MARKET/i.test(line)) {
          issuingAuthority = 'Abu Dhabi Global Market (ADGM)';
        } else if (/SAIF\s+ZONE|SHARJAH\s+AIRPORT\s+INTERNATIONAL\s+FREE/i.test(line)) {
          issuingAuthority = 'Sharjah Airport International Free Zone (SAIF Zone)';
        } else if (/HFZA\b|HAMRIYAH\s+FREE\s+ZONE/i.test(line)) {
          issuingAuthority = 'Hamriyah Free Zone Authority (HFZA)';
        } else if (/KIZAD\b|KHALIFA\s+INDUSTRIAL\s+ZONE/i.test(line)) {
          issuingAuthority = 'Khalifa Industrial Zone Abu Dhabi (KIZAD)';
        } else if (/SHAMS\b|SHARJAH\s+MEDIA\s+CITY/i.test(line)) {
          issuingAuthority = 'Sharjah Media City (Shams)';
        }
        // C. Saudi Arabia (KSA) Authorities
        else if (/MINISTRY\s+OF\s+COMMERCE\s+(?:AND\s+INVESTMENT)?|وزارة\s+التجارة/i.test(line) && /SAUDI|KSA|المملكة\s+العربية\s+السعودية/i.test(normalizedText)) {
          issuingAuthority = 'Ministry of Commerce (KSA)';
        } else if (/ZATCA\b|ZAKAT[\s,]+TAX|هيئة\s+الزكاة\s+والضريبة/i.test(line)) {
          issuingAuthority = 'Zakat, Tax and Customs Authority (ZATCA)';
        } else if (/MISA\b|MINISTRY\s+OF\s+INVESTMENT|وزارة\s+الاستثمار/i.test(line) && /SAUDI|KSA/i.test(normalizedText)) {
          issuingAuthority = 'Ministry of Investment (MISA - KSA)';
        }
        // D. Qatar, Oman, Kuwait Authorities
        else if (/MINISTRY\s+OF\s+COMMERCE\s+AND\s+INDUSTRY|وزارة\s+التجارة\s+والصناعة/i.test(line)) {
          issuingAuthority = 'Ministry of Commerce and Industry (MOCI)';
        }
        // E. India Authorities
        else if (/MINISTRY\s+OF\s+CORPORATE\s+AFFAIRS|\bMCA\b|REGISTRAR\s+OF\s+COMPANIES|\bROC\b/i.test(line)) {
          issuingAuthority = 'Ministry of Corporate Affairs / Registrar of Companies (ROC)';
        } else if (/INCOME\s+TAX\s+DEPARTMENT|CENTRAL\s+BOARD\s+OF\s+DIRECT\s+TAXES|\bCBDT\b|GOVT\.\s+OF\s+INDIA/i.test(line)) {
          issuingAuthority = 'Income Tax Department (India)';
        } else if (/GOODS\s+AND\s+SERVICES\s+TAX|\bGSTN\b|\bCBIC\b/i.test(line)) {
          issuingAuthority = 'Goods and Services Tax Network (GSTN)';
        }
        // F. UK & USA Authorities
        else if (/COMPANIES\s+HOUSE/i.test(line)) {
          issuingAuthority = 'Companies House (United Kingdom)';
        } else if (/HM\s+REVENUE\s+&\s+CUSTOMS|\bHMRC\b/i.test(line)) {
          issuingAuthority = 'HM Revenue & Customs (HMRC - UK)';
        } else if (/INTERNAL\s+REVENUE\s+SERVICE|\bIRS\b|DEPARTMENT\s+OF\s+THE\s+TREASURY/i.test(line)) {
          issuingAuthority = 'Internal Revenue Service (IRS - USA)';
        } else if (/SECRETARY\s+OF\s+STATE/i.test(line)) {
          issuingAuthority = 'Secretary of State (USA)';
        }
        // G. African Authorities
        else if (/KENYA\s+REVENUE\s+AUTHORITY|\bKRA\b/i.test(line)) {
          issuingAuthority = 'Kenya Revenue Authority (KRA)';
        } else if (/BUSINESS\s+REGISTRATION\s+SERVICE|\bBRS\b/i.test(line) && /KENYA/i.test(normalizedText)) {
          issuingAuthority = 'Business Registration Service (BRS - Kenya)';
        } else if (/UGANDA\s+REVENUE\s+AUTHORITY|\bURA\b/i.test(line)) {
          issuingAuthority = 'Uganda Revenue Authority (URA)';
        } else if (/UGANDA\s+REGISTRATION\s+SERVICES\s+BUREAU|\bURSB\b/i.test(line)) {
          issuingAuthority = 'Uganda Registration Services Bureau (URSB)';
        } else if (/FEDERAL\s+INLAND\s+REVENUE\s+SERVICE|\bFIRS\b/i.test(line)) {
          issuingAuthority = 'Federal Inland Revenue Service (FIRS - Nigeria)';
        } else if (/CORPORATE\s+AFFAIRS\s+COMMISSION|\bCAC\b/i.test(line) && /NIGERIA/i.test(normalizedText)) {
          issuingAuthority = 'Corporate Affairs Commission (CAC - Nigeria)';
        } else if (/SOUTH\s+AFRICAN\s+REVENUE\s+SERVICE|\bSARS\b/i.test(line)) {
          issuingAuthority = 'South African Revenue Service (SARS)';
        }
        // H. Asia-Pacific Authorities
        else if (/ACCOUNTING\s+AND\s+CORPORATE\s+REGULATORY\s+AUTHORITY|\bACRA\b/i.test(line)) {
          issuingAuthority = 'Accounting and Corporate Regulatory Authority (ACRA - Singapore)';
        } else if (/INLAND\s+REVENUE\s+AUTHORITY\s+OF\s+SINGAPORE|\bIRAS\b/i.test(line)) {
          issuingAuthority = 'Inland Revenue Authority of Singapore (IRAS)';
        } else if (/AUSTRALIAN\s+SECURITIES\s+AND\s+INVESTMENTS\s+COMMISSION|\bASIC\b/i.test(line)) {
          issuingAuthority = 'Australian Securities and Investments Commission (ASIC)';
        } else if (/AUSTRALIAN\s+TAXATION\s+OFFICE|\bATO\b/i.test(line)) {
          issuingAuthority = 'Australian Taxation Office (ATO)';
        }
      }
    }
  }

  // 3. Header Block & Full-Text scanning for Authority if not caught line-by-line
  if (!issuingAuthority) {
    const topHeaderText = lines.slice(0, 10).join(' ');

    if (/FEDERAL\s+TAX\s+AUTHORITY|\bFTA\b|TAX\s+REGISTRATION\s+NUMBER|\bTRN\b/i.test(normalizedText)) {
      issuingAuthority = 'Federal Tax Authority (FTA)';
    } else if (/COMMERCIAL\s+LICENSE|TRADE\s+LICENSE|ECONOMIC\s+DEVELOPMENT|\bDED\b|\bDET\b/i.test(normalizedText)) {
      issuingAuthority = 'Department of Economy and Tourism (DET / DED)';
    } else if (/\bDMCC\b/i.test(normalizedText)) {
      issuingAuthority = 'Dubai Multi Commodities Centre (DMCC)';
    } else if (/\bDIFC\b/i.test(normalizedText)) {
      issuingAuthority = 'Dubai International Financial Centre (DIFC)';
    } else if (/\bJAFZA\b/i.test(normalizedText)) {
      issuingAuthority = 'Jebel Ali Free Zone Authority (JAFZA)';
    } else if (/EMIRATES\s+ID|\bICP\b|\bEIDA\b/i.test(normalizedText)) {
      issuingAuthority = 'Federal Authority for Identity, Citizenship, Customs & Port Security (ICP)';
    } else if (/COMPANIES\s+HOUSE/i.test(normalizedText)) {
      issuingAuthority = 'Companies House (United Kingdom)';
    } else if (/KENYA\s+REVENUE\s+AUTHORITY|\bKRA\b/i.test(normalizedText)) {
      issuingAuthority = 'Kenya Revenue Authority (KRA)';
    } else if (/UGANDA\s+REVENUE\s+AUTHORITY|\bURA\b/i.test(normalizedText)) {
      issuingAuthority = 'Uganda Revenue Authority (URA)';
    } else if (/ZATCA\b|هيئة\s+الزكاة\s+والضريبة/i.test(normalizedText)) {
      issuingAuthority = 'Zakat, Tax and Customs Authority (ZATCA)';
    } else if (/MINISTRY\s+OF\s+COMMERCE/i.test(topHeaderText)) {
      issuingAuthority = 'Ministry of Commerce';
    } else if (/MINISTRY\s+OF\s+FINANCE/i.test(topHeaderText)) {
      issuingAuthority = 'Ministry of Finance';
    }
  }

  // 4. Chronological Fallback: if no keyword matched but dates exist in document
  if (!issueDate && !expirationDate) {
    const allMatches = normalizedText.match(anyDateRegex) || [];
    const validDates = allMatches.map(normalizeDateToISO).filter((d): d is string => Boolean(d));

    const plausibleDates = validDates.filter((d) => {
      const yr = parseInt(d.slice(0, 4), 10);
      return yr >= 1990 && yr <= 2099;
    });

    const uniqueDates = Array.from(new Set(plausibleDates));
    const today = new Date().toISOString().slice(0, 10);

    if (uniqueDates.length === 1) {
      const d = uniqueDates[0];
      if (d > today && !isPerpetual) {
        expirationDate = d;
      } else {
        issueDate = d;
      }
    } else if (uniqueDates.length >= 2) {
      uniqueDates.sort();
      const pastDates = uniqueDates.filter(d => d <= today);
      const futureDates = uniqueDates.filter(d => d > today);

      if (pastDates.length > 0) {
        issueDate = pastDates[0];
      } else {
        issueDate = uniqueDates[0];
      }

      if (!isPerpetual) {
        if (futureDates.length > 0) {
          expirationDate = futureDates[futureDates.length - 1];
        } else if (uniqueDates.length > 1 && uniqueDates[uniqueDates.length - 1] !== issueDate) {
          expirationDate = uniqueDates[uniqueDates.length - 1];
        }
      }
    }
  }

  // Smart cross-validation for official identity cards (e.g. UAE Emirates ID):
  if (issueDate && expirationDate) {
    const [iY, iM, iD] = issueDate.split('-').map(Number);
    const [eY, eM, eD] = expirationDate.split('-').map(Number);
    const yearDiff = eY - iY;

    if (yearDiff >= 1 && yearDiff <= 10 && Math.abs(iD - (eD + 1)) <= 1) {
      if (iM !== eM) {
        if ((iM === 6 || iM === 8) && eM === 5) {
          issueDate = `${iY}-05-${String(iD).padStart(2, '0')}`;
        } else if ((eM === 6 || eM === 8) && iM === 5) {
          expirationDate = `${eY}-05-${String(eD).padStart(2, '0')}`;
        } else {
          issueDate = `${iY}-${String(eM).padStart(2, '0')}-${String(iD).padStart(2, '0')}`;
        }
      }
    }
  }

  // 5. Extract Registration Number, Tax ID, Company Name from text if available
  let registrationNumber: string | undefined;
  let taxNumber: string | undefined;
  let companyName: string | undefined;

  const crMatch = text.match(/(?:Commercial\s+Reg(?:istration)?|CR\s*No\.?|C\.R\s*No\.?|Trade\s+Licen[sc]e\s*No\.?|Licen[sc]e\s*No\.?|سجل\s*تجاري|رقم\s*السجل|رقم\s*الرخصة)\s*[:#\-–]?\s*([A-Za-z0-9\/\-]{4,25})/i);
  if (crMatch && crMatch[1] && !/^(date|issue|expiry|page|valid|from|to)$/i.test(crMatch[1])) {
    registrationNumber = crMatch[1].trim();
  }

  const taxMatch = text.match(/(?:Tax\s*ID|Tax\s*Reg(?:istration)?(?:\s*No\.?)?|VAT\s*Reg(?:istration)?(?:\s*No\.?)?|TRN\s*No\.?|TRN\b|الرقم\s*الضريبي|TIN\b|GSTIN\b)\s*[:#\-–]?\s*([A-Za-z0-9]{8,25})/i);
  if (taxMatch && taxMatch[1] && !/^(date|issue|expiry|page|valid|from|to)$/i.test(taxMatch[1])) {
    taxNumber = taxMatch[1].trim();
  }

  const nameMatch = text.match(/(?:Company\s*Name|Legal\s*Name|Establishment\s*Name|Business\s*Name|اسم\s*الشركة|اسم\s*المنشأة|اسم\s*المؤسسة)\s*[:\-–]\s*([A-Za-z0-9\u0600-\u06FF\s.,&'\-]{3,80})/i);
  if (nameMatch && nameMatch[1]) {
    const rawN = nameMatch[1].split(/[\r\n]/)[0].trim().replace(/[;,]$/, '');
    if (rawN.length >= 3 && !/^(the|ltd|llc|inc|corp|company)$/i.test(rawN)) {
      companyName = rawN;
    }
  }

  return {
    issueDate,
    expirationDate,
    issuingAuthority,
    registrationNumber,
    taxNumber,
    companyName,
    rawText: text,
  };
}

/**
 * Runs OCR on an uploaded file (image or PDF).
 * Primary: Uses high-accuracy server-side OCR endpoint (Python OCR with layout detection).
 * Fallback: Uses in-browser Tesseract.js Worker for offline client-side support on images.
 */
export async function scanDocumentWithOcr(
  file: File,
  _onProgress?: (progress: number) => void
): Promise<ExtractedDocumentDates> {
  // 1. Primary: Server OCR endpoint (RapidOCR ONNX + PDF Layout Reconstructor)
  try {
    const formData = new FormData();
    formData.append('document', file);
    const resp = await fetch(`${API_BASE}/vendors/ocr-extract-dates`, {
      method: 'POST',
      body: formData,
    });
    if (resp.ok) {
      const json = await resp.json();
      const serverResult = json?.data || json;
      if (
        serverResult?.issueDate ||
        serverResult?.expirationDate ||
        serverResult?.issuingAuthority ||
        serverResult?.registrationNumber ||
        serverResult?.taxNumber ||
        serverResult?.companyName
      ) {
        return {
          documentType: serverResult.documentType,
          issueDate: serverResult.issueDate,
          expirationDate: serverResult.expirationDate,
          issuingAuthority: serverResult.issuingAuthority,
          registrationNumber: serverResult.registrationNumber,
          taxNumber: serverResult.taxNumber,
          taxValidationStatus: serverResult.taxValidationStatus,
          taxStandard: serverResult.taxStandard,
          emiratesIdNumber: serverResult.emiratesIdNumber,
          companyName: serverResult.companyName,
          arabicCompanyName: serverResult.arabicCompanyName,
          legalEntityType: serverResult.legalEntityType,
          capitalAmount: serverResult.capitalAmount,
          authorizedSignatory: serverResult.authorizedSignatory,
          iban: serverResult.iban,
          swiftCode: serverResult.swiftCode,
          hijriIssueDate: serverResult.hijriIssueDate,
          hijriExpirationDate: serverResult.hijriExpirationDate,
          healthStatus: serverResult.healthStatus,
          daysToExpiry: serverResult.daysToExpiry,
          healthMessage: serverResult.healthMessage,
          avgConfidence: serverResult.avgConfidence,
          llmEscalated: serverResult.llmEscalated,
          llmProvider: serverResult.llmProvider,
          qrData: serverResult.qrData,
          rawText: serverResult.rawText || '',
        };
      }
    }
  } catch (serverErr) {
    console.warn('Server OCR endpoint unavailable or failed, attempting client fallback:', serverErr);
  }

  // 2. Client-side fallback for images using in-browser Tesseract.js
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
  if (isImage) {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      try {
        const ret = await worker.recognize(file);
        const text = ret?.data?.text || '';
        const parsed = parseDocumentDates(text);
        if (parsed.issueDate || parsed.expirationDate || parsed.issuingAuthority) {
          return parsed;
        }
      } finally {
        await worker.terminate();
      }
    } catch (err) {
      console.warn('Client-side Tesseract OCR fallback failed:', err);
    }
  }

  return { rawText: '' };
}
