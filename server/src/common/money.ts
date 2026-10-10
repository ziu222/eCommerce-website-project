/** Money is handled in integer cents and written to NUMERIC columns as exact strings. */
export const centsToString = (cents: number): string => (cents / 100).toFixed(2);
export const toCents = (value: number | string | { toString(): string }): number => Math.round(Number(value.toString()) * 100);
