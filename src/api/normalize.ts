/** Coerce Prisma Decimal / API string amounts to number */
export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isNaN(n) ? 0 : n;
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as { toNumber?: () => number; toString?: () => string };
    if (typeof obj.toNumber === 'function') return obj.toNumber();
    if (typeof obj.toString === 'function') {
      const n = parseFloat(obj.toString());
      return Number.isNaN(n) ? 0 : n;
    }
  }
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

/** Unwrap list from paginated API `data` (or raw array) */
export function pickList<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of keys) {
      const val = obj[key];
      if (Array.isArray(val)) return val as T[];
    }
  }
  return [];
}
