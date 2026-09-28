import type { RequiredDocument } from '../../../services/companySettingsService';

type DocumentDraft = Pick<RequiredDocument, 'name' | 'documentCategory' | 'fieldType' | 'expirationAlertDays' | 'expirationAlertFrequency' | 'trackIssueDate' | 'trackExpirationDate' | 'trackIssuingAuthority'>;

export function requiredDocumentPayload(doc: DocumentDraft) {
  return {
    name: doc.name.trim(),
    documentCategory: doc.documentCategory || 'mandatory',
    fieldType: doc.fieldType || 'attachment',
    expirationAlertDays: doc.expirationAlertDays ?? 30,
    expirationAlertFrequency: doc.expirationAlertFrequency || 'DAILY',
    trackIssueDate: doc.trackIssueDate ?? true,
    trackExpirationDate: doc.trackExpirationDate ?? true,
    trackIssuingAuthority: doc.trackIssuingAuthority ?? true,
  };
}
export function requiredDocumentChanged(original: DocumentDraft, draft: DocumentDraft) {
  return JSON.stringify(requiredDocumentPayload(original)) !== JSON.stringify(requiredDocumentPayload(draft));
}
export function requiredDocumentErrors(documents: DocumentDraft[]) {
  const errors: string[] = [];
  const names = new Set<string>();
  documents.forEach((doc, index) => {
    const name = doc.name.trim();
    if (!name) errors.push(`Document ${index + 1} needs a name.`);
    else if (names.has(name.toLowerCase())) errors.push(`Document name "${name}" is duplicated.`);
    names.add(name.toLowerCase());
    const days = doc.expirationAlertDays ?? 30;
    if (!Number.isInteger(days) || days < 0 || days > 365) errors.push(`${name || `Document ${index + 1}`}: alert days must be a whole number from 0 to 365.`);
  });
  return errors;
}
