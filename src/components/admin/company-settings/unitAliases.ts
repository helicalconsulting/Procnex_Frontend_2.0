/** Unit APIs may return either an array or the stored comma-separated aliases. */
export function unitAliases(value?: string | string[] | null): string[] {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean);
  if (!value) return [];
  if (value.trim().startsWith('[')) {
    try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed)) return unitAliases(parsed); } catch { /* Treat legacy plain text as aliases. */ }
  }
  return value.split(/[,;|]/).map(item => item.trim()).filter(Boolean);
}
