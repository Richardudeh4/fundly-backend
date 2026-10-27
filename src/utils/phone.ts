export function normalizePhone(input: string): string {
  const p = input.replace(/\s+/g, '');
  if (p.startsWith('+234')) return p;
  if (p.startsWith('234')) return '+' + p;
  if (p.startsWith('0')) return '+234' + p.slice(1);
  return p;
}