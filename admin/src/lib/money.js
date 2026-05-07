/** Белорусский рубль (BYN) */
export function formatByn(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '—';
  try {
    return new Intl.NumberFormat('be-BY', {
      style: 'currency',
      currency: 'BYN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${num.toLocaleString('be-BY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BYN`;
  }
}
