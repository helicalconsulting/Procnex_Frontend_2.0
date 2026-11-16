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

  // 2. Format: DD-Mon-YYYY or DD Mon YYYY (e.g., 15 Oct 2028 or 15-OCT-2028)
  const dMonY = cleaned.match(/\b(0?[1-9]|[12]\d|3[01])[-\/\s]([A-Za-z]{3,9})[-\/\s](19\d\d|20\d\d)\b/i);
  if (dMonY) {
    const d = dMonY[1].padStart(2, '0');
    const monStr = dMonY[2].toLowerCase();
    const m = MONTH_MAP[monStr] || MONTH_MAP[monStr.slice(0, 3)];
    const y = dMonY[3];
    if (m) return `${y}-${m}-${d}`;
  }

  // 3. Format: DD/MM/YYYY or DD-MM-YYYY
  const dmy = cleaned.match(/\b(0?[1-9]|[12]\d|3[01])[-\/\.](0?[1-9]|1[0-2])[-\/\.](19\d\d|20\d\d)\b/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3];
    return `${y}-${m}-${d}`;
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

  const issueKeywords = /(?:issuing\s*date|date\s*of\s*issue|issue\s*date|issued\s*on|registration\s*date|valid\s*from|doi\b|تاريخ\s*الإصدار|تاريخ\s*الاصدار)/i;
  const expiryKeywords = /(?:date\s*of\s*expir\w*|expiry\s*date|expiration\s*date|expires\s*on|valid\s*until|valid\s*thru|valid\s*upto|doe\b|تاريخ\s*الانتهاء)/i;
  const anyDateRegex = /(?:\b\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{4}\b|\b\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2}\b|\b\d{1,2}[-\/\s][A-Za-z]{3,9}[-\/\s]\d{4}\b)/g;

  // DOB pattern to explicitly avoid treating Birth Date as Issue Date
  const birthKeywords = /(?:date\s*of\s*birth|birth\s*date|dob\b|تاريخ\s*الميلاد)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check Issue Date: Must match issue keywords and NEVER match birth keywords
    if (!issueDate && issueKeywords.test(line) && !birthKeywords.test(line)) {
      const matchInLine = line.match(anyDateRegex);
      if (matchInLine && matchInLine[0]) {
        const iso = normalizeDateToISO(matchInLine[0]);
        if (iso) issueDate = iso;
      } else if (i + 1 < lines.length && !birthKeywords.test(lines[i + 1])) {
        const nextLineMatch = lines[i + 1].match(anyDateRegex);
        if (nextLineMatch && nextLineMatch[0]) {
          const iso = normalizeDateToISO(nextLineMatch[0]);
          if (iso) issueDate = iso;
        }
      }
    }

    // Check Expiration Date
    if (!expirationDate && expiryKeywords.test(line)) {
      const matchInLine = line.match(anyDateRegex);
      if (matchInLine && matchInLine[0]) {
        const iso = normalizeDateToISO(matchInLine[0]);
        if (iso) expirationDate = iso;
      } else if (i + 1 < lines.length) {
        const nextLineMatch = lines[i + 1].match(anyDateRegex);
        if (nextLineMatch && nextLineMatch[0]) {
          const iso = normalizeDateToISO(nextLineMatch[0]);
          if (iso) expirationDate = iso;
        }
      }
    }

    // Check for common issuing authorities
    if (!issuingAuthority) {
      if (/EMIRATES\s+ID|UNITED\s+ARAB\s+EMIRATES|FEDERAL\s+AUTHORITY\s+FOR\s+IDENTITY/i.test(line) || /ICP\b|الهيئة\s+الاتحادية/i.test(line)) {
        issuingAuthority = 'Federal Authority for Identity, Citizenship, Customs & Port Security (ICP)';
      } else if (/DEPARTMENT\s+OF\s+ECONOMIC/i.test(line) || /\bDED\b|اقتصادية/i.test(line)) {
        issuingAuthority = 'Department of Economic Development (DED)';
      } else if (/MINISTRY\s+OF\s+FINANCE/i.test(line) || /وزارة\s+المالية/i.test(line)) {
        issuingAuthority = 'Ministry of Finance';
      } else if (/INCOME\s+TAX\s+DEPARTMENT/i.test(line) || /GOVT\.\s+OF\s+INDIA/i.test(line)) {
        issuingAuthority = 'Income Tax Department';
      }
    }
  }

  // Also scan whole text for Emirates ID / ICP if not caught on line-level
  if (!issuingAuthority) {
    if (/UNITED\s+ARAB\s+EMIRATES|EMIRATES\s+ID/i.test(text)) {
      issuingAuthority = 'Federal Authority for Identity, Citizenship, Customs & Port Security (ICP)';
    } else if (/COMMERCIAL\s+LICENSE|TRADE\s+LICENSE|ECONOMIC\s+DEVELOPMENT/i.test(text)) {
      issuingAuthority = 'Department of Economic Development (DED)';
    }
  }

  // Smart cross-validation for official identity cards (e.g. UAE Emirates ID):
  // Official IDs have 1, 2, 3, 5, or 10-year validity periods where issue and expiry
  // share the same month (and expiry day is issue day - 1 or same day).
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
 * Runs client-side OCR on an image file using Tesseract.js Worker
 */
export async function scanDocumentWithOcr(
  file: File,
  onProgress?: (progress: number) => void
): Promise<ExtractedDocumentDates> {
  // Dynamically import tesseract.js to avoid initial bundle size inflation
  const { createWorker } = await import('tesseract.js');

  const worker = await createWorker('eng');

  try {
    // Recognize image
    const ret = await worker.recognize(file);
    const text = ret?.data?.text || '';

    return parseDocumentDates(text);
  } finally {
    await worker.terminate();
  }
}
