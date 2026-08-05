import crypto from 'crypto';
import TelegramBot from 'node-telegram-bot-api';
import { formatByn } from './formatMoney.js';
import { get, run } from './db.js';
import { transitionOrderStatus } from './orderStatus.js';
import { blockedUserMessage, getBlockStatus } from './blockedUsers.js';
import { claimReferral } from './referrals.js';

let bot = null;
let botUsername = '';

/** Юзернейм бота (для реферальных ссылок t.me/<bot>?start=ref_...). */
export function getBotUsername() {
  return botUsername;
}

/** В группе с OWNER_CHAT_ID укажи OWNER_USER_ID (числовой user id того, кто жмёт кнопки). В личке с ботом не нужно. */
function canOwnerActOnCallbackQuery(query, ownerChatIdExpected) {
  const expectedChat = String(ownerChatIdExpected ?? '').trim();
  const msg = query.message;
  if (!msg || String(msg.chat?.id ?? '') !== expectedChat) return false;
  if (msg.chat.type === 'private') return true;
  const uid = String(process.env.OWNER_USER_ID || '').trim();
  return Boolean(uid && String(query.from?.id ?? '') === uid);
}

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

  bot.getMe()
    .then((me) => { botUsername = me?.username || ''; })
    .catch((e) => console.error('bot getMe:', e?.message || e));

  // /start [ref_<id>] — привязка реферала + кнопка Mini App
  bot.onText(/\/start(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from?.id ?? chatId);
    try {
      const block = await getBlockStatus(userId);
      if (block.blocked) {
        await bot.sendMessage(chatId, `🚫 ${blockedUserMessage(block.reason)}`);
        return;
      }
    } catch (e) {
      console.error('/start block check:', e?.message || e);
    }

    let refGreeting = '';
    const payload = String(match?.[1] || '').trim();
    const refMatch = payload.match(/^ref_(\d+)$/);
    if (refMatch) {
      try {
        const res = await claimReferral(refMatch[1], userId);
        if (res.ok) {
          refGreeting = '\n\n🤝 Вы пришли по приглашению друга — оформите первый заказ, и он получит бонус!';
        }
      } catch (e) {
        console.error('/start referral claim:', e?.message || e);
      }
    }

    bot.sendMessage(chatId, `🛍 Добро пожаловать в Vape Shop!${refGreeting}\n\nНажми кнопку ниже чтобы открыть магазин:`, {
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

  // Inline-кнопки «Выдан» / «Отменить» под уведомлением о заказе
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    const match = data.match(/^order:(done|cancel):(\d+)$/);
    if (!match) return;

    if (!canOwnerActOnCallbackQuery(query, ownerChatId)) {
      try {
        await bot.answerCallbackQuery(query.id, { text: 'Доступно только владельцу.' });
      } catch (_) { /* ignore */ }
      return;
    }

    const orderId = parseInt(match[2], 10);
    const nextStatus = match[1] === 'done' ? 'done' : 'cancelled';
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    try {
      const trans = await transitionOrderStatus(orderId, nextStatus);
      if (!trans.ok) {
        const alert = trans.code === 'INSUFFICIENT_STOCK';
        await bot.answerCallbackQuery(query.id, {
          text: (trans.message || trans.code || 'Ошибка').slice(0, 200),
          show_alert: alert,
        });
        return;
      }
      if (trans.skipped) {
        await bot.answerCallbackQuery(query.id, {
          text: nextStatus === 'done' ? 'Уже отмечен выданным' : 'Уже отменён',
        });
        return;
      }

      const row = trans.order;
      if (row?.telegram_user_id) {
        notifyCustomerOrderStatus(row.telegram_user_id, orderId, nextStatus);
      }

      if (nextStatus === 'cancelled') {
        try {
          await bot.deleteMessage(chatId, messageId);
        } catch (_) { /* уже удалено или нет прав */ }
        await bot.answerCallbackQuery(query.id, { text: `Заказ #${orderId} отменён` });
        return;
      }

      const base = query.message.text || '';
      const suffix = '\n\n✅ Выдано: клиент уведомлён.';
      try {
        await bot.editMessageText(base + suffix, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        });
      } catch (_) {
        /** На части клиентов editMessage падает (длина/HTML) — кнопки можно оставить, статус уже в БД. */
      }
      await bot.answerCallbackQuery(query.id, { text: `Заказ #${orderId} выдан` });
    } catch (e) {
      console.error('callback_query order:', e?.message || e);
      try {
        await bot.answerCallbackQuery(query.id, { text: 'Ошибка сервера' });
      } catch (_) { /* ignore */ }
    }
  });

  // Ответы владельца на сообщения о заказах — async DB
  bot.on('message', async (msg) => {
    if (String(msg.chat.id) !== String(ownerChatId)) return;
    if (!msg.reply_to_message) return;

    const text = msg.reply_to_message.text || '';
    /** Текст уведомления: «Новый заказ #N» — ловим кириллицу после «Ответить» */
    const match = text.match(/заказ\s*#\s*(\d+)/i);
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
        `Сообщение магазина по заказу #${orderId}:\n\n${msg.text}`,
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

  const uname = order.telegram_username ? String(order.telegram_username).replace(/^@/, '') : '';
  const itemsList = items
    .map(i => `  • ${i.name} × ${i.qty} = ${formatByn(i.price * i.qty)}`)
    .join('\n');

  const subtotal = Number(order.subtotal);
  const discountTotal = Number(order.discount_total) || 0;
  const levelPercent = Number(order.level_discount_percent) || 0;
  const hasDiscountBlock = discountTotal > 0 || order.coupon_title;

  const discountLines = hasDiscountBlock
    ? [
      '',
      'СКИДКИ:',
      Number.isFinite(subtotal) && subtotal > 0 ? `  Подытог: ${formatByn(subtotal)}` : null,
      levelPercent > 0 ? `  Уровень рефералки: −${levelPercent}%` : null,
      order.coupon_title ? `  🎟 Купон: ${order.coupon_title}` : null,
      discountTotal > 0 ? `  Скидка всего: −${formatByn(discountTotal)}` : null,
      String(order.coupon_title || '').toLowerCase().includes('подарок')
        ? '  🎁 НЕ ЗАБУДЬТЕ ПОЛОЖИТЬ ПОДАРОК К ЗАКАЗУ!'
        : null,
    ]
    : [];

  const lines = [
    `🛒 Новый заказ #${order.id}`,
    '',
    'КЛИЕНТ (связь):',
    order.telegram_first_name ? `Имя: ${order.telegram_first_name}` : null,
    `Telegram id: ${order.telegram_user_id}`,
    uname ? `Юзер: @${uname} → чат: https://t.me/${uname}` : 'Юзернейма нет — откройте диалог через Mini App клиента или id выше.',
    `Быстрое открытие чата в приложении Telegram: tg://user?id=${order.telegram_user_id}`,
    '',
    'ТОВАРЫ:',
    itemsList || '  —',
    ...discountLines,
    '',
    `💰 Итого: ${formatByn(order.total)}`,
    order.customer_note ? `📝 Комментарий клиента: ${order.customer_note}` : null,
    '',
    'Ниже — кнопки: «Выдан» (клиенту уведомление) или «Отменить» (остатки вернутся на склад, сообщение удалится).',
    '',
    '⬆️ Ответьте на это сообщение — текст уйдёт клиенту в Telegram.',
  ];

  bot.sendMessage(ownerChatId, lines.filter(Boolean).join('\n'), {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Выдан', callback_data: `order:done:${order.id}` },
        { text: '❌ Отменить', callback_data: `order:cancel:${order.id}` },
      ]],
    },
  }).catch(e => console.error('notifyOwner:', e.message));
}

/** Произвольное сообщение пользователю (награды рефералки и т.п.). */
export function notifyUserText(telegramUserId, text) {
  if (!bot || !telegramUserId || !text) return;
  bot.sendMessage(String(telegramUserId), String(text)).catch(e => console.error('notifyUserText:', e.message));
}

export function notifyCustomer(telegramUserId, orderId) {
  if (!bot || !telegramUserId) return;
  bot
    .sendMessage(
      String(telegramUserId),
      `Заказ №${orderId} принят. Ожидайте сообщение от магазина или ответ здесь.`,
    )
    .catch(e => console.error('notifyCustomer:', e.message));
}

/** Когда владелец меняет статус в админке — сообщение клиенту */
export function notifyCustomerOrderStatus(telegramUserId, orderId, newStatus) {
  if (!bot || !telegramUserId) return;
  let msg = '';
  if (newStatus === 'cancelled') {
    msg = `Заказ №${orderId} отменён. Если нужны уточнения — напишите нам здесь или через приложение.`;
  } else if (newStatus === 'done') {
    msg = `Заказ №${orderId} выполнен и выдан. Спасибо за покупку.`;
  } else {
    return;
  }
  bot.sendMessage(String(telegramUserId), msg).catch(e => console.error('notifyCustomerOrderStatus:', e.message));
}
