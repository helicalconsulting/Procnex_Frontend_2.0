/**
 * Vendor Matching & Duplication Analysis Utility
 *
 * Evaluates candidate similarity across 4 key fields with priority weighting:
 * - Company Name: 40% (Positional Word 1 priority + Levenshtein fuzzy similarity)
 * - Vendor Email: 40% (Exact match, @ username match, and corporate domain match)
 * - Contact Person: 10% (Exact, token overlap, and Levenshtein typo distance)
 * - Phone Number: 10% (Exact digits, subscriber suffix match across country dial codes)
 */

export interface VendorMatchTarget {
  id?: string | number;
  vendorNo?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  contactPerson?: string | null;
  category?: string | null;
  supplierType?: string | null;
  status?: string | null;
}

export interface VendorMatchCandidate {
  id?: string | number;
  vendorNo?: string | null;
  companyName: string;
  contactEmail: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  category?: string | null;
  supplierType?: string | null;
  status?: string | null;
}

export interface MatchFieldBreakdown {
  score: number;
  weight: number;
  matchedVendor?: string;
  matchedValue?: string;
  targetValue?: string;
  explanation?: string;
}

export interface VendorMatchAnalysis {
  score: number; // 0 to 100
  duplicationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  matchedVendor: {
    id?: string | number;
    name: string;
    email: string;
    phone?: string;
    contactPerson?: string;
    vendorNo?: string;
    status?: string;
    category?: string;
    score: number;
  } | null;
  isMultiVendorMatch: boolean;
  multiVendorSummary: string;
  breakdown: {
    name: MatchFieldBreakdown;
    email: MatchFieldBreakdown;
    person: MatchFieldBreakdown;
    phone: MatchFieldBreakdown;
  };
  totalCandidatesScanned: number;
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[a.length][b.length];
}

export function normalizeCompanyName(str?: string): string {
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[,\-_&/\\()]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(pvt|private|ltd|limited|llc|inc|corporation|co)\b\.?/gi, '')
    .trim();
}

/**
 * Calculate Fuzzy String Match Score (0 - 100) between two company names.
 * Uses positional priority: Word 1 must match Word 1.
 */
export function calculateFuzzyNameMatchScore(s1: string, s2: string): number {
  const n1 = normalizeCompanyName(s1);
  const n2 = normalizeCompanyName(s2);

  if (!n1 || !n2) return 0;
  if (n1 === n2) return 100;

  const words1 = n1.split(' ').filter(Boolean);
  const words2 = n2.split(' ').filter(Boolean);
  if (words1.length === 0 || words2.length === 0) return 0;

  const wordSim = (w1: string, w2: string) => {
    if (w1 === w2) return 100;

    const prefixSim = (shorter: string, longer: string) => {
      const ratio = shorter.length / longer.length;
      if (shorter.length <= 1) return Math.round(ratio * 30);
      if (shorter.length === 2) return Math.round(ratio * 85);
      if (ratio >= 0.8) return Math.round(75 + ratio * 25);
      if (ratio >= 0.6) return Math.round(60 + (ratio - 0.6) * 75);
      return Math.round(35 + ratio * 40);
    };

    if (w2.startsWith(w1)) return prefixSim(w1, w2);
    if (w1.startsWith(w2)) return prefixSim(w2, w1);
    const maxL = Math.max(w1.length, w2.length);
    const d = levenshteinDistance(w1, w2);
    if (d === 1 && maxL >= 4) return Math.max(75, Math.round(((maxL - d) / maxL) * 100));
    if (d <= 2 && maxL >= 7) return Math.max(70, Math.round(((maxL - d) / maxL) * 100));
    return 0;
  };

  // Rule 1: First word must match first word
  const w1Score = wordSim(words1[0], words2[0]);
  if (w1Score === 0) return 0;

  // Single word query
  if (words1.length === 1) {
    if (words2.length === 1) return w1Score;
    const penalty = Math.min(15, (words2.length - 1) * 3);
    return Math.max(0, w1Score - penalty);
  }

  // Rule 2: Multi-word query (evaluates Word 1 then Word 2)
  const w2Score = words2.length > 1 ? wordSim(words1[1], words2[1]) : 0;
  const combined = Math.round(w1Score * 0.6 + w2Score * 0.4);
  return combined;
}

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'rediffmail.com',
  'zoho.com',
  'protonmail.com',
  'mail.com',
]);

/**
 * Calculate Email Match Score (0 - 100)
 */
export function calculateEmailMatchScore(
  e1?: string | null,
  e2?: string | null
): { score: number; explanation: string } {
  const clean1 = (e1 || '').trim().toLowerCase();
  const clean2 = (e2 || '').trim().toLowerCase();

  if (!clean1 || !clean2) {
    return { score: 0, explanation: 'No email provided' };
  }

  if (clean1 === clean2) {
    return { score: 100, explanation: 'Exact email address match' };
  }

  const [u1, d1] = clean1.split('@');
  const [u2, d2] = clean2.split('@');

  const isUserMatch = Boolean(u1 && u2 && u1 === u2);
  const isDomainMatch = Boolean(d1 && d2 && d1 === d2 && !GENERIC_EMAIL_DOMAINS.has(d1));

  if (isUserMatch && isDomainMatch) {
    return { score: 100, explanation: 'Username and corporate domain match' };
  }
  if (isUserMatch) {
    return { score: 75, explanation: `Same username (${u1}) across different mail domains` };
  }
  if (isDomainMatch) {
    return { score: 60, explanation: `Same corporate domain (@${d1})` };
  }

  return { score: 0, explanation: 'Different email address and domain' };
}

/**
 * Calculate Contact Person Match Score (0 - 100)
 */
export function calculatePersonMatchScore(
  p1?: string | null,
  p2?: string | null
): { score: number; explanation: string } {
  const norm = (s?: string | null) => (s || '').trim().toLowerCase();
  const s1 = norm(p1);
  const s2 = norm(p2);

  if (!s1 || !s2) {
    return { score: 0, explanation: 'No contact person specified' };
  }

  if (s1 === s2) {
    return { score: 100, explanation: 'Exact contact person name match' };
  }

  if (s1.includes(s2) || s2.includes(s1)) {
    return { score: 75, explanation: 'Sub-name overlap match' };
  }

  const w1 = s1.split(/\s+/).filter(Boolean);
  const w2 = s2.split(/\s+/).filter(Boolean);
  if (w1.some((w) => w2.includes(w) && w.length >= 3)) {
    return { score: 50, explanation: 'Partial name token match' };
  }

  const dist = levenshteinDistance(s1, s2);
  const maxL = Math.max(s1.length, s2.length);
  if (dist <= 2 && maxL >= 5) {
    const sc = Math.max(60, Math.round(((maxL - dist) / maxL) * 100));
    return { score: sc, explanation: 'Fuzzy typo tolerance match' };
  }

  return { score: 0, explanation: 'Different contact person' };
}

/**
 * Calculate Phone Number Match Score (0 - 100)
 */
export function calculatePhoneMatchScore(
  ph1?: string | null,
  ph2?: string | null
): { score: number; explanation: string } {
  const d1 = (ph1 || '').replace(/\D/g, '');
  const d2 = (ph2 || '').replace(/\D/g, '');

  if (!d1 || !d2 || d1.length < 5 || d2.length < 5) {
    return { score: 0, explanation: 'No valid phone number' };
  }

  if (d1 === d2) {
    return { score: 100, explanation: 'Exact phone number match' };
  }

  if (d1.endsWith(d2) || d2.endsWith(d1)) {
    return { score: 100, explanation: 'Matching international subscriber digits' };
  }

  if (d1.length >= 7 && d2.length >= 7) {
    const minLen = Math.min(9, d1.length, d2.length);
    if (d1.slice(-minLen) === d2.slice(-minLen)) {
      return { score: 85, explanation: 'Matching subscriber digits across dial codes' };
    }
  }

  return { score: 0, explanation: 'Different phone numbers' };
}

const PRIORITY_WEIGHTS = {
  name: 0.40,
  email: 0.40,
  person: 0.10,
  phone: 0.10,
};

/**
 * Calculate full vendor duplication and matching analysis for a target vendor against candidates.
 */
export function calculateVendorMatchAnalysis(
  target: VendorMatchTarget,
  candidates: VendorMatchCandidate[]
): VendorMatchAnalysis {
  const norm = (s?: string | null) => (s || '').trim().toLowerCase();
  const targetId = String(target.id || '').trim();
  const targetVendorNo = (target.vendorNo || '').trim().toLowerCase();
  const targetEmail = norm(target.email);
  const targetName = normalizeCompanyName(target.name);

  // Filter out the vendor itself
  const validCandidates = candidates.filter((cand) => {
    const candId = String(cand.id || '').trim();
    if (targetId && candId && targetId === candId) return false;

    const candVendorNo = (cand.vendorNo || '').trim().toLowerCase();
    if (targetVendorNo && candVendorNo && targetVendorNo === candVendorNo) return false;

    // If identical ID is missing, but it's the exact same entity instance
    if (candId && candId === targetId) return false;

    return true;
  });

  let bestNameMatch: { name: string; email: string; score: number; vendor?: VendorMatchCandidate } | null = null;
  let bestEmailMatch: { name: string; email: string; score: number; vendor?: VendorMatchCandidate; explanation: string } | null = null;
  let bestPersonMatch: { name: string; email: string; score: number; vendor?: VendorMatchCandidate; explanation: string } | null = null;
  let bestPhoneMatch: { name: string; email: string; score: number; vendor?: VendorMatchCandidate; explanation: string } | null = null;

  let bestSingleVendor: {
    id?: string | number;
    name: string;
    email: string;
    phone?: string;
    contactPerson?: string;
    vendorNo?: string;
    status?: string;
    category?: string;
    score: number;
  } | null = null;
  let bestSingleScore = 0;

  for (const cand of validCandidates) {
    // 1. Company Name Match (40% Weight)
    const nameScore = calculateFuzzyNameMatchScore(target.name, cand.companyName);
    if (nameScore > (bestNameMatch?.score || 0)) {
      bestNameMatch = { name: cand.companyName, email: cand.contactEmail, score: nameScore, vendor: cand };
    }

    // 2. Email Match (40% Weight)
    const emailResult = calculateEmailMatchScore(target.email, cand.contactEmail);
    if (emailResult.score > (bestEmailMatch?.score || 0)) {
      bestEmailMatch = {
        name: cand.companyName,
        email: cand.contactEmail,
        score: emailResult.score,
        explanation: emailResult.explanation,
        vendor: cand,
      };
    }

    // 3. Contact Person Match (10% Weight)
    const personResult = calculatePersonMatchScore(target.contactPerson, cand.contactPerson);
    if (personResult.score > (bestPersonMatch?.score || 0)) {
      bestPersonMatch = {
        name: cand.companyName,
        email: cand.contactEmail,
        score: personResult.score,
        explanation: personResult.explanation,
        vendor: cand,
      };
    }

    // 4. Phone Match (10% Weight)
    const phoneResult = calculatePhoneMatchScore(target.phone, cand.contactPhone);
    if (phoneResult.score > (bestPhoneMatch?.score || 0)) {
      bestPhoneMatch = {
        name: cand.companyName,
        email: cand.contactEmail,
        score: phoneResult.score,
        explanation: phoneResult.explanation,
        vendor: cand,
      };
    }

    // Single candidate composite score
    const candTotal = Math.round(
      nameScore * PRIORITY_WEIGHTS.name +
      emailResult.score * PRIORITY_WEIGHTS.email +
      personResult.score * PRIORITY_WEIGHTS.person +
      phoneResult.score * PRIORITY_WEIGHTS.phone
    );

    if (candTotal > bestSingleScore) {
      bestSingleScore = candTotal;
      bestSingleVendor = {
        id: cand.id,
        name: cand.companyName,
        email: cand.contactEmail,
        phone: cand.contactPhone || undefined,
        contactPerson: cand.contactPerson || undefined,
        vendorNo: cand.vendorNo || undefined,
        status: cand.status || undefined,
        category: cand.category || undefined,
        score: candTotal,
      };
    }
  }

  const nameScore = bestNameMatch?.score || 0;
  const emailScore = bestEmailMatch?.score || 0;
  const personScore = bestPersonMatch?.score || 0;
  const phoneScore = bestPhoneMatch?.score || 0;

  const multiFieldScore = Math.round(
    nameScore * PRIORITY_WEIGHTS.name +
    emailScore * PRIORITY_WEIGHTS.email +
    personScore * PRIORITY_WEIGHTS.person +
    phoneScore * PRIORITY_WEIGHTS.phone
  );

  const finalScore = Math.max(bestSingleScore, multiFieldScore);

  let risk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (finalScore >= 60) risk = 'HIGH';
  else if (finalScore >= 25) risk = 'MEDIUM';

  // Detect cross-vendor match (Name matches Vendor A, Email matches Vendor B)
  const isMultiVendor = Boolean(
    bestNameMatch &&
    nameScore >= 40 &&
    bestEmailMatch &&
    emailScore >= 50 &&
    norm(bestNameMatch.name) !== norm(bestEmailMatch.name)
  );

  let multiSummary = '';
  if (isMultiVendor && bestNameMatch && bestEmailMatch) {
    multiSummary = `${bestNameMatch.name} (Name ${nameScore}%) & ${bestEmailMatch.name} (Email ${emailScore}%)`;
  }

  const primaryCandidateVendor = isMultiVendor
    ? (bestSingleVendor || (bestNameMatch?.vendor ? {
        id: bestNameMatch.vendor.id,
        name: bestNameMatch.vendor.companyName,
        email: bestNameMatch.vendor.contactEmail,
        phone: bestNameMatch.vendor.contactPhone || undefined,
        contactPerson: bestNameMatch.vendor.contactPerson || undefined,
        vendorNo: bestNameMatch.vendor.vendorNo || undefined,
        status: bestNameMatch.vendor.status || undefined,
        category: bestNameMatch.vendor.category || undefined,
        score: nameScore,
      } : null))
    : (bestSingleVendor || (bestNameMatch?.vendor ? {
        id: bestNameMatch.vendor.id,
        name: bestNameMatch.vendor.companyName,
        email: bestNameMatch.vendor.contactEmail,
        phone: bestNameMatch.vendor.contactPhone || undefined,
        contactPerson: bestNameMatch.vendor.contactPerson || undefined,
        vendorNo: bestNameMatch.vendor.vendorNo || undefined,
        status: bestNameMatch.vendor.status || undefined,
        category: bestNameMatch.vendor.category || undefined,
        score: nameScore,
      } : null));

  return {
    score: finalScore,
    duplicationRisk: risk,
    matchedVendor: finalScore > 0 && primaryCandidateVendor ? primaryCandidateVendor : null,
    isMultiVendorMatch: isMultiVendor,
    multiVendorSummary: multiSummary,
    breakdown: {
      name: {
        score: nameScore,
        weight: PRIORITY_WEIGHTS.name,
        matchedVendor: bestNameMatch?.name,
        targetValue: target.name,
        explanation: nameScore === 100 ? 'Exact company name match' : nameScore > 0 ? `Fuzzy positional match (${nameScore}%)` : 'No matching name found',
      },
      email: {
        score: emailScore,
        weight: PRIORITY_WEIGHTS.email,
        matchedVendor: bestEmailMatch?.name,
        matchedValue: bestEmailMatch?.email,
        targetValue: target.email,
        explanation: bestEmailMatch?.explanation || 'No matching email found',
      },
      person: {
        score: personScore,
        weight: PRIORITY_WEIGHTS.person,
        matchedVendor: bestPersonMatch?.name,
        matchedValue: bestPersonMatch?.vendor?.contactPerson || undefined,
        targetValue: target.contactPerson || undefined,
        explanation: bestPersonMatch?.explanation || 'No matching contact person found',
      },
      phone: {
        score: phoneScore,
        weight: PRIORITY_WEIGHTS.phone,
        matchedVendor: bestPhoneMatch?.name,
        matchedValue: bestPhoneMatch?.vendor?.contactPhone || undefined,
        targetValue: target.phone || undefined,
        explanation: bestPhoneMatch?.explanation || 'No matching phone number found',
      },
    },
    totalCandidatesScanned: validCandidates.length,
  };
}
