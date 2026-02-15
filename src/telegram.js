/**
 * Telegram Adapter
 *
 * Handles sending CAPTCHA images and receiving solutions via Telegram Bot API.
 * Supports both text replies and inline keyboard buttons for faster solving.
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';

export class TelegramAdapter {
  /**
   * @param {object} config
   * @param {string} config.botToken - Telegram Bot API token
   * @param {string} config.chatId - Chat ID to send CAPTCHAs to
   * @param {number} config.pollInterval - How often to check for replies (ms, default: 500)
   */
  constructor({ botToken, chatId, pollInterval = 500 }) {
    if (!botToken) throw new Error('botToken is required');
    if (!chatId) throw new Error('chatId is required');
    this.botToken = botToken;
    this.chatId = String(chatId);
    this.pollInterval = pollInterval;
    this._baseUrl = `${TELEGRAM_API}${botToken}`;
    this._lastUpdateId = 0;
  }

  /**
   * Send a photo with caption and optional inline keyboard.
   */
  async sendPhoto(chatId, imageBuffer, caption, options = {}) {
    const formData = new FormData();
    formData.append('chat_id', chatId || this.chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    formData.append('photo', new Blob([imageBuffer], { type: 'image/png' }), 'captcha.png');

    if (options.replyMarkup) {
      formData.append('reply_markup', JSON.stringify(options.replyMarkup));
    }

    const resp = await fetch(`${this._baseUrl}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });

    const data = await resp.json();
    if (!data.ok) throw new Error(`Telegram sendPhoto failed: ${data.description}`);
    return data.result;
  }

  /**
   * Send a photo with an inline grid keyboard for CAPTCHA solving.
   *
   * Creates a grid of toggle buttons (1-N) plus a ✅ Submit row.
   * User taps cells to toggle them, then hits Submit.
   *
   * @param {string} chatId
   * @param {Buffer} imageBuffer
   * @param {string} caption
   * @param {number} cols - Grid columns
   * @param {number} rows - Grid rows
   */
  async sendCaptchaWithButtons(chatId, imageBuffer, caption, cols, rows) {
    const keyboard = buildGridKeyboard(cols, rows);
    return this.sendPhoto(chatId, imageBuffer, caption, {
      replyMarkup: { inline_keyboard: keyboard },
    });
  }

  /**
   * Send a text message.
   */
  async sendMessage(chatId, text, options = {}) {
    const body = {
      chat_id: chatId || this.chatId,
      text,
      parse_mode: 'HTML',
    };
    if (options.replyMarkup) body.reply_markup = options.replyMarkup;

    const resp = await fetch(`${this._baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description}`);
    return data.result;
  }

  /**
   * Answer a callback query (removes the "loading" indicator on button press).
   */
  async answerCallbackQuery(callbackQueryId, text = '') {
    const resp = await fetch(`${this._baseUrl}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
    return resp.json();
  }

  /**
   * Edit the inline keyboard on an existing message (to show toggle state).
   */
  async editMessageReplyMarkup(chatId, messageId, replyMarkup) {
    const resp = await fetch(`${this._baseUrl}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId || this.chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      }),
    });
    return resp.json();
  }

  /**
   * Wait for a text reply from the human.
   */
  async waitForReply(chatId, timeout = 120000) {
    const targetChat = chatId || this.chatId;
    const deadline = Date.now() + timeout;

    await this._flushUpdates();

    while (Date.now() < deadline) {
      const updates = await this._getUpdates();

      for (const update of updates) {
        const msg = update.message;
        if (!msg || !msg.text) continue;
        if (String(msg.chat.id) === String(targetChat)) {
          this._lastUpdateId = update.update_id + 1;
          return msg.text.trim();
        }
      }

      await sleep(this.pollInterval);
    }

    return null;
  }

  /**
   * Wait for the user to select cells via inline buttons and hit Submit.
   *
   * Handles callback_query updates:
   * - "cell:N" toggles cell N in the selected set
   * - "submit" finalizes and returns the selected cells
   * - "skip" returns empty array (no matches)
   *
   * Updates the keyboard in real-time to show selected state (✅ prefix).
   *
   * @param {string} chatId
   * @param {number} messageId - The message with the inline keyboard
   * @param {number} cols
   * @param {number} rows
   * @param {number} timeout
   * @returns {Promise<{cells: number[], skipped: boolean} | null>}
   */
  async waitForButtonResponse(chatId, messageId, cols, rows, timeout = 120000) {
    const targetChat = String(chatId || this.chatId);
    const deadline = Date.now() + timeout;
    const selected = new Set();

    await this._flushUpdates();

    while (Date.now() < deadline) {
      const updates = await this._getUpdates(['callback_query', 'message']);

      for (const update of updates) {
        // Handle text fallback (user types numbers instead of using buttons)
        if (update.message?.text && String(update.message.chat.id) === targetChat) {
          this._lastUpdateId = update.update_id + 1;
          const cells = update.message.text.match(/\d+/g)?.map(Number) || [];
          if (cells.length) return { cells, skipped: false };
        }

        // Handle button presses
        const cb = update.callback_query;
        if (!cb) continue;
        if (String(cb.message?.chat?.id) !== targetChat) continue;
        if (cb.message?.message_id !== messageId) continue;

        this._lastUpdateId = update.update_id + 1;
        const data = cb.data;

        if (data === 'submit') {
          await this.answerCallbackQuery(cb.id, `✅ Submitting: ${[...selected].sort((a, b) => a - b).join(', ')}`);
          // Remove keyboard
          await this.editMessageReplyMarkup(targetChat, messageId, { inline_keyboard: [] });
          return { cells: [...selected].sort((a, b) => a - b), skipped: false };
        }

        if (data === 'skip') {
          await this.answerCallbackQuery(cb.id, '⏭️ Skipping');
          await this.editMessageReplyMarkup(targetChat, messageId, { inline_keyboard: [] });
          return { cells: [], skipped: true };
        }

        if (data.startsWith('cell:')) {
          const cellNum = parseInt(data.split(':')[1], 10);
          if (selected.has(cellNum)) {
            selected.delete(cellNum);
            await this.answerCallbackQuery(cb.id, `Deselected ${cellNum}`);
          } else {
            selected.add(cellNum);
            await this.answerCallbackQuery(cb.id, `Selected ${cellNum}`);
          }

          // Update keyboard to reflect selection state
          const newKeyboard = buildGridKeyboard(cols, rows, selected);
          await this.editMessageReplyMarkup(targetChat, messageId, {
            inline_keyboard: newKeyboard,
          });
        }
      }

      await sleep(this.pollInterval);
    }

    return null; // Timeout
  }

  /**
   * Get new updates from Telegram.
   */
  async _getUpdates(allowedUpdates = ['message', 'callback_query']) {
    try {
      const resp = await fetch(
        `${this._baseUrl}/getUpdates?offset=${this._lastUpdateId}&timeout=2&allowed_updates=${JSON.stringify(allowedUpdates)}`
      );
      const data = await resp.json();
      if (!data.ok) return [];

      if (data.result.length > 0) {
        const maxId = Math.max(...data.result.map((u) => u.update_id));
        this._lastUpdateId = maxId + 1;
      }

      return data.result;
    } catch {
      return [];
    }
  }

  /**
   * Flush pending updates so we only get new ones.
   */
  async _flushUpdates() {
    try {
      const resp = await fetch(`${this._baseUrl}/getUpdates?offset=-1&timeout=0`);
      const data = await resp.json();
      if (data.ok && data.result.length > 0) {
        this._lastUpdateId = data.result[data.result.length - 1].update_id + 1;
      }
    } catch {
      // Ignore flush errors
    }
  }
}

/**
 * Build an inline keyboard grid for CAPTCHA cell selection.
 *
 * Layout example for 3x3:
 *   [ 1 ] [ 2 ] [ 3 ]
 *   [ 4 ] [ 5 ] [ 6 ]
 *   [ 7 ] [ 8 ] [ 9 ]
 *   [  ⏭️ Skip  ] [ ✅ Submit ]
 *
 * Selected cells show as "✅ N".
 *
 * @param {number} cols
 * @param {number} rows
 * @param {Set<number>} selected - Currently selected cell numbers
 * @returns {Array<Array<object>>} Telegram inline_keyboard format
 */
export function buildGridKeyboard(cols, rows, selected = new Set()) {
  const keyboard = [];
  let cellNum = 1;

  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const isSelected = selected.has(cellNum);
      row.push({
        text: isSelected ? `✅ ${cellNum}` : `${cellNum}`,
        callback_data: `cell:${cellNum}`,
      });
      cellNum++;
    }
    keyboard.push(row);
  }

  // Action row
  keyboard.push([
    { text: '⏭️ Skip', callback_data: 'skip' },
    { text: `✅ Submit (${selected.size})`, callback_data: 'submit' },
  ]);

  return keyboard;
}

/**
 * OpenClaw Telegram Adapter (unchanged)
 */
export class OpenClawTelegramAdapter {
  constructor({ sendMessage, sendPhoto, waitForMessage, chatId }) {
    this.sendMessageFn = sendMessage;
    this.sendPhotoFn = sendPhoto;
    this.waitForMessageFn = waitForMessage;
    this.chatId = chatId;
  }

  async sendPhoto(chatId, imageBuffer, caption) {
    return this.sendPhotoFn(chatId || this.chatId, imageBuffer, caption);
  }

  async sendMessage(chatId, text) {
    return this.sendMessageFn(chatId || this.chatId, text);
  }

  async waitForReply(chatId, timeout) {
    return this.waitForMessageFn(chatId || this.chatId, timeout);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
