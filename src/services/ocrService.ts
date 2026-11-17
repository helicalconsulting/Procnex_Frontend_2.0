/**
 * Client-Side OCR Service for extracting dates from uploaded documents
 * (Emirates ID, Trade License, Passports, Driving Licenses, etc.)
 */

export interface ExtractedDocumentDates {
  issueDate?: string;       // Formatted as YYYY-MM-DD
  expirationDate?: string;  // Formatted as YYYY-MM-DD
  issuingAuthority?: string;
  rawText: string;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
};

/**
 * Standardize any matched date string into YYYY-MM-DD for HTML <input type="date">
 */
export function normalizeDateToISO(dateStr: string): string | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim().replace(/[,\.]/g, ' ');

  // 1. Format: YYYY-MM-DD or YYYY/MM/DD
  const ymd = cleaned.match(/\b(19\d\d|20\d\d)[-\/\s](0?[1-9]|1[0-2])[-\/\s](0?[1-9]|[12]\d|3[01])\b/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. Format: DD-Mon-YYYY or DD Mon YYYY (e.g., 15 Oct 2028 or 15-OCT-2028 or 15 October 2028)
  const dMonY = cleaned.match(/\b(0?[1-9]|[12]\d|3[01])[-\/\s]([A-Za-z]{3,9})[-\/\s](19\d\d|20\d\d)\b/i);
  if (dMonY) {
    const d = dMonY[1].padStart(2, '0');
    const monStr = dMonY[2].toLowerCase();
    const m = MONTH_MAP[monStr] || MONTH_MAP[monStr.slice(0, 3)];
    const y = dMonY[3];
    if (m) return `${y}-${m}-${d}`;
  }

  // 2b. Format: Mon DD, YYYY (e.g., October 15, 2028 or Oct 15 2028)
  const monDY = cleaned.match(/\b([A-Za-z]{3,9})[-\/\s](0?[1-9]|[12]\d|3[01])[-\/\s,]+(19\d\d|20\d\d)\b/i);
  if (monDY) {
    const monStr = monDY[1].toLowerCase();
    const m = MONTH_MAP[monStr] || MONTH_MAP[monStr.slice(0, 3)];
    const d = monDY[2].padStart(2, '0');
    const y = monDY[3];
    if (m) return `${y}-${m}-${d}`;
  }

  // 3. Format: Numeric separator date (DD/MM/YYYY or MM/DD/YYYY)
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
    // If both <= 12, default to DD/MM/YYYY
    return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Analyzes extracted text lines to locate Date of Issue & Date of Expiration.
 */
export function parseDocumentDates(text: string): ExtractedDocumentDates {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let issueDate: string | undefined;
  let expirationDate: string | undefined;
  let issuingAuthority: string | undefined;

  const issueKeywords = /(?:issuing\s*date|date\s*of\s*issue|issue\s*date|issued\s*on|registration\s*date|effective\s*date|commencement\s*date|valid\s*from|valid\s*since|start\s*date|doi\b|issued?\b|تاريخ\s*الإصدار|تاريخ\s*الاصدار|الإصدار)/i;
  const expiryKeywords = /(?:date\s*of\s*expir\w*|expiry\s*date|expiration\s*date|expires\s*on|valid\s*until|valid\s*thru|valid\s*upto|valid\s*up\s*to|valid\s*to|valid\s*till|validity|deadline|due\s*date|end\s*date|termination\s*date|expiry\b|expir\w*|exp\b|doe\b|تاريخ\s*الانتهاء|صلاحية)/i;
  const anyDateRegex = /(?:\b\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{4}\b|\b\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2}\b|\b\d{1,2}[-\/\s][A-Za-z]{3,9}[-\/\s]\d{4}\b)/g;

  // DOB pattern to explicitly avoid treating Birth Date as Issue Date
  const birthKeywords = /(?:date\s*of\s*birth|birth\s*date|dob\b|تاريخ\s*الميلاد)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check Issue Date: Must match issue keywords and NEVER match birth keywords
    if (!issueDate && issueKeywords.test(line) && !birthKeywords.test(line)) {
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

    // Check Expiration Date
    if (!expirationDate && expiryKeywords.test(line)) {
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

    // Check for common issuing authorities
    if (!issuingAuthority) {
      if (/EMIRATES\s+ID|UNITED\s+ARAB\s+EMIRATES|FEDERAL\s+AUTHORITY\s+FOR\s+IDENTITY/i.test(line) || /ICP\b|الهيئة\s+الاتحادية/i.test(line)) {
        issuingAuthority = 'Federal Authority for Identity, Citizenship, Customs & Port Security (ICP)';
      } else if (/FEDERAL\s+TAX\s+AUTHORITY|TAX\s+REGISTRATION|\bFTA\b|الهيئة\s+الاتحادية\s+للضرائب/i.test(line)) {
        issuingAuthority = 'Federal Tax Authority (FTA)';
      } else if (/DEPARTMENT\s+OF\s+ECONOMIC|ECONOMY\s+AND\s+TOURISM|\bDED\b|\bDET\b|اقتصادية/i.test(line)) {
        issuingAuthority = 'Department of Economic Development (DED)';
      } else if (/MINISTRY\s+OF\s+FINANCE|وزارة\s+المالية/i.test(line)) {
        issuingAuthority = 'Ministry of Finance';
      } else if (/MINISTRY\s+OF\s+ECONOMY|وزارة\s+الاقتصاد/i.test(line)) {
        issuingAuthority = 'Ministry of Economy';
      } else if (/INCOME\s+TAX\s+DEPARTMENT|GOVT\.\s+OF\s+INDIA/i.test(line)) {
        issuingAuthority = 'Income Tax Department';
      }
    }
  }

  // Also scan whole text for Emirates ID / ICP or FTA / DED if not caught on line-level
  if (!issuingAuthority) {
    if (/FEDERAL\s+TAX\s+AUTHORITY|\bFTA\b|TAX\s+REGISTRATION/i.test(text)) {
      issuingAuthority = 'Federal Tax Authority (FTA)';
    } else if (/UNITED\s+ARAB\s+EMIRATES|EMIRATES\s+ID/i.test(text)) {
      issuingAuthority = 'Federal Authority for Identity, Citizenship, Customs & Port Security (ICP)';
    } else if (/COMMERCIAL\s+LICENSE|TRADE\s+LICENSE|ECONOMIC\s+DEVELOPMENT|\bDED\b/i.test(text)) {
      issuingAuthority = 'Department of Economic Development (DED)';
    }
  }

  // Fallback: if no keyword matched but dates exist in document
  if (!issueDate && !expirationDate) {
    const allMatches = text.match(anyDateRegex) || [];
    const validDates = allMatches.map(normalizeDateToISO).filter((d): d is string => Boolean(d));
    const uniqueDates = Array.from(new Set(validDates));
    if (uniqueDates.length === 1) {
      const d = uniqueDates[0];
      const today = new Date().toISOString().slice(0, 10);
      if (d > today) {
        expirationDate = d;
      } else {
        issueDate = d;
      }
    } else if (uniqueDates.length >= 2) {
      uniqueDates.sort();
      issueDate = uniqueDates[0];
      expirationDate = uniqueDates[uniqueDates.length - 1];
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

  return {
    issueDate,
    expirationDate,
    issuingAuthority,
    rawText: text,
  };
}

/**
 * Runs OCR on an image file using client-side Tesseract.js Worker,
 * with fallback to server-side endpoint for PDFs and complex documents.
 */
export async function scanDocumentWithOcr(
  file: File,
  onProgress?: (progress: number) => void
): Promise<ExtractedDocumentDates> {
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);

  // 1. If image, run Tesseract.js in the browser
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
      console.warn('Client-side OCR failed, attempting server OCR fallback:', err);
    }
  }

  // 2. Fallback to server OCR endpoint (supports PDF text extraction + Tesseract)
  try {
    const formData = new FormData();
    formData.append('document', file);
    const resp = await fetch('/api/vendors/ocr-extract-dates', {
      method: 'POST',
      body: formData,
    });
    if (resp.ok) {
      const data = await resp.json();
      const serverResult = data?.data || data;
      if (serverResult?.issueDate || serverResult?.expirationDate || serverResult?.issuingAuthority) {
        return {
          issueDate: serverResult.issueDate,
          expirationDate: serverResult.expirationDate,
          issuingAuthority: serverResult.issuingAuthority,
          rawText: serverResult.rawText || '',
        };
      }
    }
  } catch (serverErr) {
    console.warn('Server OCR fallback failed or unreachable:', serverErr);
  }

  return { rawText: '' };
}
