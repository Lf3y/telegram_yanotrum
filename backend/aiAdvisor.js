/**
 * AI-консультант по подбору вкусов из каталога (Anthropic Claude).
 */

const MODEL = 'claude-3-5-haiku-20241022';

/**
 * @param {string} query
 * @param {Array<Record<string, unknown>>} products
 * @returns {Promise<{ intro: string, picks: Array<{ id: number, reason: string }> }>}
 */
export async function adviseProducts(query, products) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('AI-консультант не настроен (нет ANTHROPIC_API_KEY)');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  const q = String(query || '').trim();
  if (q.length < 3) {
    const err = new Error('Опишите предпочтения подробнее (минимум 3 символа)');
    err.code = 'QUERY_TOO_SHORT';
    throw err;
  }

  const catalog = products
    .filter((p) => p.in_stock !== 0)
    .slice(0, 100)
    .map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      price: p.price,
      nicotine: p.nicotine,
      volume: p.volume,
      description: p.description ? String(p.description).slice(0, 140) : null,
      stock_qty: p.stock_qty,
    }));

  if (!catalog.length) {
    const err = new Error('В каталоге нет доступных товаров для подбора');
    err.code = 'NO_PRODUCTS';
    throw err;
  }

  const prompt = `Ты дружелюбный консультант vape-магазина в Беларуси. Клиент описал, что хочет.
Подбери 3–5 товаров ТОЛЬКО из переданного каталога (id должны совпадать).
Учитывай вкус, крепость (nicotine), бренд, наличие. Пиши по-русски, кратко и по делу.

Запрос клиента: ${q}

Каталог (JSON):
${JSON.stringify(catalog)}

Ответь СТРОГО валидным JSON без markdown и без комментариев:
{"intro":"1–2 предложения","picks":[{"id":123,"reason":"почему подходит"}]}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 900,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`AI-сервис недоступен (${res.status})`);
    err.code = 'AI_UPSTREAM';
    err.detail = body.slice(0, 200);
    throw err;
  }

  const data = await res.json();
  const text = data?.content?.find((c) => c.type === 'text')?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const err = new Error('Не удалось разобрать ответ AI');
    err.code = 'AI_PARSE';
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    const err = new Error('Некорректный JSON от AI');
    err.code = 'AI_PARSE';
    throw err;
  }

  const validIds = new Set(catalog.map((p) => Number(p.id)));
  const picks = (Array.isArray(parsed.picks) ? parsed.picks : [])
    .filter((p) => validIds.has(Number(p.id)))
    .slice(0, 5)
    .map((p) => ({
      id: Number(p.id),
      reason: String(p.reason || '').trim() || 'Подходит под ваш запрос',
    }));

  return {
    intro: String(parsed.intro || 'Вот что могу предложить из нашего каталога:').trim(),
    picks,
  };
}
