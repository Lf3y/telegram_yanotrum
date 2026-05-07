import TelegramBot from 'node-telegram-bot-api';
import { get, run } from './db.js';

let bot = null;

export function initBot(token, ownerChatId, frontendUrl) {
  if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
    console.log('⚠️  Bot token not set — notifications disabled');
    return null;
  }

  bot = new TelegramBot(token, { polling: true });

  // /start command — send mini app button
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🛍 Добро пожаловать в Vape Shop!\n\nНажми кнопку ниже чтобы открыть магазин:', {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🛒 Открыть магазин',
            web_app: { url: frontendUrl }
          }
        ]]
      }
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
        { parse_mode: 'Markdown' }
      );

      await bot.sendMessage(ownerChatId, `✅ Ответ отправлен клиенту (заказ #${orderId})`);
    } catch (e) {
      console.error('bot reply handling:', e?.message || e);
    }
  });

  console.log('🤖 Telegram bot started');
  return bot;
}

export function notifyOwner(ownerChatId, order, items) {
  if (!bot) return;
  if (!ownerChatId || ownerChatId === 'YOUR_TELEGRAM_ID_HERE') return;

  const itemsList = items.map(i => `  • ${i.name} × ${i.qty} = ${(i.price * i.qty).toLocaleString('ru')}₽`).join('\n');
  const username = order.telegram_username ? `@${order.telegram_username}` : (order.telegram_first_name || 'Аноним');

  const text = `🛒 *Новый заказ #${order.id}*\n\n` +
    `👤 Клиент: ${username} (id: \`${order.telegram_user_id}\`)\n` +
    `📦 Товары:\n${itemsList}\n\n` +
    `💰 Итого: *${order.total.toLocaleString('ru')}₽*\n` +
    (order.customer_note ? `📝 Заметка клиента: ${order.customer_note}\n` : '') +
    `\n⬆️ *Ответьте на это сообщение* чтобы написать клиенту`;

  bot.sendMessage(ownerChatId, text, { parse_mode: 'Markdown' });
}

export function notifyCustomer(telegramUserId, orderId) {
  if (!bot || !telegramUserId) return;
  bot.sendMessage(telegramUserId,
    `✅ *Заказ #${orderId} принят!*\n\nМы скоро свяжемся с вами для подтверждения.\nСпасибо, что выбрали нас! 🙏`,
    { parse_mode: 'Markdown' }
  );
}
