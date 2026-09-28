/** Percentages are calculated in hundredths to avoid floating-point drift. */
export function percentageUnits(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const units = Math.round(Number(value) * 100);
  return units > 0 && units <= 10000 ? units : null;
}

export function acceptPercentageInput(value: string): boolean {
  return value === '' || (/^\d{1,3}(\.\d{0,2})?$/.test(value) && Number(value) <= 100);
}

/** Keep manual allocations; distribute only across blank or previously auto-filled rows. */
export function allocatePercentages(
  values: string[],
  manual: boolean[] = values.map(value => value !== ''),
): string[] | null {
  if (!values.length || manual.length !== values.length) return null;
  const targets: number[] = [];
  let remaining = 10000;
  for (let index = 0; index < values.length; index++) {
    if (!manual[index] || values[index] === '') {
      targets.push(index);
    } else {
      const units = percentageUnits(values[index]);
      if (units === null) return null;
      remaining -= units;
    }
  }
  if (!targets.length) return remaining === 0 ? [...values] : null;
  // Every milestone must receive at least 0.01%, including after rounding.
  if (remaining < targets.length) return null;
  const each = Math.floor(remaining / targets.length);
  const result = [...values];
  targets.forEach((index, order) => {
    result[index] = ((each + (order < remaining % targets.length ? 1 : 0)) / 100).toString();
  });
  return result;
}
