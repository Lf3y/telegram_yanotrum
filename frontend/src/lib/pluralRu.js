/**
 * Русские формы числа: 1 заказ, 2 заказа, 5 заказов (учёт 11–14).
 */
export function pluralRu(n, one, few, many) {
  const abs = Math.abs(Math.trunc(n));
  const n100 = abs % 100;
  const n10 = abs % 10;
  if (n100 >= 11 && n100 <= 14) return many;
  if (n10 === 1) return one;
  if (n10 >= 2 && n10 <= 4) return few;
  return many;
}
