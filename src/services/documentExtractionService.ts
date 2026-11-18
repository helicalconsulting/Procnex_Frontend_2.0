// ============================================================
// services/documentExtractionService.ts
// Frontend API service for Document Extraction & Layout Reconstruction
// ============================================================

import type {
  DocumentExtractionSummary,
  CanonicalPage,
  UserPageEdits,
  QualityValidationReport,
} from '../types/documentExtraction';

import { API_BASE, authHeaders as getClientAuthHeaders } from '../api/client';

function getHeaders(isMultipart = false): HeadersInit {
  const headers = { ...getClientAuthHeaders() } as Record<string, string>;
  if (isMultipart) {
    delete headers['Content-Type'];
  }
  return headers;
}

export const documentExtractionService = {
  /**
   * Uploads a document and begins extraction
   */
  async uploadDocument(
    file: File,
    title?: string,
    referenceType?: string,
    referenceId?: string
  ): Promise<DocumentExtractionSummary> {
    const formData = new FormData();
    formData.append('document', file);
    if (title) formData.append('title', title);
    if (referenceType) formData.append('referenceType', referenceType);
    if (referenceId) formData.append('referenceId', referenceId);

    const res = await fetch(`${API_BASE}/documents/extract/upload`, {
      method: 'POST',
      headers: getHeaders(true),
      body: formData,
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Upload failed');
    return json.data;
  },

  /**
   * Polls job status
   */
  async getJobStatus(id: string): Promise<DocumentExtractionSummary> {
    const res = await fetch(`${API_BASE}/documents/extract/jobs/${id}`, {
      headers: getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch status');
    return json.data;
  },

  /**
   * Gets document metadata and list of pages
   */
  async getDocument(id: string): Promise<DocumentExtractionSummary> {
    const res = await fetch(`${API_BASE}/documents/extract/documents/${id}`, {
      headers: getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch document');
    return json.data;
  },

  /**
   * Gets page layout with elements
   */
  async getPageLayout(id: string, pageIndex: number): Promise<CanonicalPage> {
    const res = await fetch(`${API_BASE}/documents/extract/documents/${id}/pages/${pageIndex}`, {
      headers: getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch page layout');
    return json.data;
  },

  /**
   * Saves user edits for a page
   */
  async savePageEdits(id: string, pageIndex: number, edits: UserPageEdits): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/extract/documents/${id}/pages/${pageIndex}/edits`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(edits),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to save edits');
  },

  /**
   * Triggers reprocessing
   */
  async reprocess(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/extract/documents/${id}/reprocess`, {
      method: 'POST',
      headers: getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Reprocessing failed');
  },

  /**
   * Runs visual quality comparison
   */
  async getComparison(id: string, pageIndex: number): Promise<QualityValidationReport> {
    const res = await fetch(`${API_BASE}/documents/extract/documents/${id}/comparison/${pageIndex}`, {
      headers: getHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Quality check failed');
    return json.data;
  },

  /**
   * Downloads Reconstructed PDF
   */
  async downloadReconstructedPdf(id: string, filename: string): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/extract/documents/${id}/export/reconstructed-pdf`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reconstructed_${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  /**
   * Downloads JSON Model
   */
  async downloadJson(id: string, filename: string): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/extract/documents/${id}/export/json`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('JSON export failed');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_model.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};
