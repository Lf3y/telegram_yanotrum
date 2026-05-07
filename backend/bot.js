import crypto from 'crypto';
import TelegramBot from 'node-telegram-bot-api';
import { get, run } from './db.js';

let bot = null;

/**
 * @param {import('express').Express} expressApp — для POST webhook (Render продакшен)
 */
export function initBot(expressApp, token, ownerChatId, frontendUrl) {
  if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
    console.log('⚠️  Bot token not set — notifications disabled');
    return null;
  }

  const webhookBase = (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_BASE_URL || '')
    .trim()
    .replace(/\/$/, '');
  /** Явный polling на проде (только один инстанс в мире!) */
  const forcePolling = ['1', 'true', 'yes'].includes(
    String(process.env.TELEGRAM_FORCE_POLLING || '').toLowerCase(),
  );
  /** Путь webhook: секрет в URL (можно свой TELEGRAM_WEBHOOK_SECRET, иначе стабильный хеш от токена) */
  const pathSecretRaw =
    process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
    || crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 32);

  let useWebhook = Boolean(webhookBase) && !forcePolling;
  if (useWebhook && expressApp?.post) {
    // ok
  } else if (useWebhook && !expressApp?.post) {
    useWebhook = false;
    console.warn('⚠️  Webhook requested but Express app не передан — включается polling');
  }

  bot = new TelegramBot(token, { polling: !useWebhook });

  // /start command — send mini app button
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🛍 Добро пожаловать в Vape Shop!\n\nНажми кнопку ниже чтобы открыть магазин:', {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🛒 Открыть магазин',
            web_app: { url: frontendUrl },
          },
        ]],
      },
    });
  });

  // Ответы владельца на сообщения о заказах — async DB
  bot.on('message', async (msg) => {
    if (String(msg.chat.id) !== String(ownerChatId)) return;
    if (!msg.reply_to_message) return;

    const text = msg.reply_to_message.text || '';
    const match = text.match(/Заказ #(\d+)/);
    if (!match) return;

    const orderId = parseInt(match[1], 10);
    try {
      const order = await get('SELECT * FROM orders WHERE id = ?', [orderId]);
      if (!order) return;

      await run(
        'UPDATE orders SET owner_note = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [msg.text, 'replied', orderId],
      );

      await bot.sendMessage(
        order.telegram_user_id,
        `💬 *Ответ магазина по заказу #${orderId}:*\n\n${msg.text}`,
        { parse_mode: 'Markdown' },
      );

      await bot.sendMessage(ownerChatId, `✅ Ответ отправлен клиенту (заказ #${orderId})`);
    } catch (e) {
      console.error('bot reply handling:', e?.message || e);
    }
  });

  if (useWebhook) {
    const hookPath = `/api/telegram/webhook/${encodeURIComponent(pathSecretRaw)}`;
    expressApp.post(hookPath, (req, res) => {
      try {
        bot.processUpdate(req.body);
        res.sendStatus(200);
      } catch (e) {
        console.error('telegram webhook:', e?.message || e);
        res.sendStatus(500);
      }
    });
    const hookUrl = `${webhookBase}${hookPath}`;
    bot
      .deleteWebHook({ drop_pending_updates: false })
      .catch(() => {})
      .finally(() =>
        bot
          .setWebHook(hookUrl)
          .then(() =>
            console.log(
              '🤖 Telegram webhook:',
              webhookBase,
              '/api/telegram/webhook/*** (без polling, конфликт 409 не от второго процесса на Render)',
            ),
          )
          .catch((e) => console.error('setWebHook failed:', e.message)),
      );
  } else {
    const hint = !webhookBase
      ? '(нет RENDER_EXTERNAL_URL / PUBLIC_BASE_URL — режим разработки)'
      : '(TELEGRAM_FORCE_POLLING: держи только один процесс с этим BOT_TOKEN!)';
    console.log('🤖 Telegram long polling', hint);
  }

  return bot;
}

export function notifyOwner(ownerChatId, order, items) {
  if (!bot) return;
  if (!ownerChatId || ownerChatId === 'YOUR_TELEGRAM_ID_HERE') return;

  const itemsList = items.map(i => `  • ${i.name} × ${i.qty} = ${(i.price * i.qty).toLocaleString('ru')}₽`).join('\n');
  const username = order.telegram_username ? `@${order.telegram_username}` : (order.telegram_first_name || 'Аноним');

  const text =
    `🛒 *Новый заказ #${order.id}*\n\n`
    + `👤 Клиент: ${username} (id: \`${order.telegram_user_id}\`)\n`
    + `📦 Товары:\n${itemsList}\n\n`
    + `💰 Итого: *${order.total.toLocaleString('ru')}₽*\n`
    + (order.customer_note ? `📝 Заметка клиента: ${order.customer_note}\n` : '')
    + `\n⬆️ *Ответьте на это сообщение* чтобы написать клиенту`;

  bot.sendMessage(ownerChatId, text, { parse_mode: 'Markdown' });
}

export function notifyCustomer(telegramUserId, orderId) {
  if (!bot || !telegramUserId) return;
  bot.sendMessage(
    telegramUserId,
    `✅ *Заказ #${orderId} принят!*\n\nМы скоро свяжемся с вами для подтверждения.\nСпасибо, что выбрали нас! 🙏`,
    { parse_mode: 'Markdown' },
  );
}
