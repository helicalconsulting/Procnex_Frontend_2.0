/**
 * Download Utility
 * Fetches a file from a URL and triggers a browser download with the given filename.
 * Falls back to opening in a new tab if CORS prevents direct download.
 */
export async function downloadDocument(docUrl: string, filename: string): Promise<void> {
  try {
    const response = await fetch(docUrl);
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // Fallback: open in new tab when direct download isn't possible (e.g. CORS)
    window.open(docUrl, '_blank', 'noopener,noreferrer');
  }
}
