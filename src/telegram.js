/**
 * Telegram Adapter
 *
 * Handles sending CAPTCHA images and receiving solutions via Telegram Bot API.
 * Designed to work standalone or integrate with OpenClaw's existing Telegram channel.
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';

export class TelegramAdapter {
  /**
   * @param {object} config
   * @param {string} config.botToken - Telegram Bot API token
   * @param {string} config.chatId - Chat ID to send CAPTCHAs to
   * @param {number} config.pollInterval - How often to check for replies (ms, default: 1000)
   */
  constructor({ botToken, chatId, pollInterval = 1000 }) {
    if (!botToken) throw new Error('botToken is required');
    if (!chatId) throw new Error('chatId is required');
    this.botToken = botToken;
    this.chatId = String(chatId);
    this.pollInterval = pollInterval;
    this._baseUrl = `${TELEGRAM_API}${botToken}`;
    this._lastUpdateId = 0;
  }

  /**
   * Send a photo with caption to the configured chat.
   *
   * @param {string} chatId - Telegram chat ID
   * @param {Buffer} imageBuffer - PNG image data
   * @param {string} caption - Message text to accompany the image
   * @returns {Promise<object>} Telegram API response
   */
  async sendPhoto(chatId, imageBuffer, caption) {
    const formData = new FormData();
    formData.append('chat_id', chatId || this.chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    formData.append('photo', new Blob([imageBuffer], { type: 'image/png' }), 'captcha.png');

    const resp = await fetch(`${this._baseUrl}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });

    const data = await resp.json();
    if (!data.ok) {
      throw new Error(`Telegram sendPhoto failed: ${data.description}`);
    }
    return data.result;
  }

  /**
   * Send a text message to the configured chat.
   *
   * @param {string} chatId - Telegram chat ID
   * @param {string} text - Message text
   * @returns {Promise<object>}
   */
  async sendMessage(chatId, text) {
    const resp = await fetch(`${this._baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId || this.chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    const data = await resp.json();
    if (!data.ok) {
      throw new Error(`Telegram sendMessage failed: ${data.description}`);
    }
    return data.result;
  }

  /**
   * Wait for a reply from the human in the configured chat.
   *
   * Polls getUpdates and looks for text messages from the target chat
   * that arrive after the CAPTCHA was sent.
   *
   * @param {string} chatId - Telegram chat ID to listen on
   * @param {number} timeout - Max time to wait in ms
   * @returns {Promise<string|null>} The reply text, or null on timeout
   */
  async waitForReply(chatId, timeout = 120000) {
    const targetChat = chatId || this.chatId;
    const deadline = Date.now() + timeout;

    // Flush any pending updates first
    await this._flushUpdates();

    while (Date.now() < deadline) {
      const updates = await this._getUpdates();

      for (const update of updates) {
        const msg = update.message;
        if (!msg || !msg.text) continue;

        // Check if this message is from our target chat
        if (String(msg.chat.id) === String(targetChat)) {
          // Acknowledge this update
          this._lastUpdateId = update.update_id + 1;
          return msg.text.trim();
        }
      }

      // Wait before polling again
      await sleep(this.pollInterval);
    }

    return null; // Timeout
  }

  /**
   * Get new updates from Telegram.
   */
  async _getUpdates() {
    try {
      const resp = await fetch(
        `${this._baseUrl}/getUpdates?offset=${this._lastUpdateId}&timeout=2&allowed_updates=["message"]`
      );
      const data = await resp.json();
      if (!data.ok) return [];

      if (data.result.length > 0) {
        // Track the latest update ID
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
      const resp = await fetch(
        `${this._baseUrl}/getUpdates?offset=-1&timeout=0`
      );
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
 * OpenClaw Telegram Adapter
 *
 * Uses OpenClaw's message tool to send/receive instead of direct Bot API.
 * This allows captcha-relay to work through OpenClaw's existing Telegram
 * channel without needing a separate bot token.
 */
export class OpenClawTelegramAdapter {
  /**
   * @param {object} config
   * @param {function} config.sendMessage - OpenClaw message sending function
   * @param {function} config.sendPhoto - Function to send photo via OpenClaw
   * @param {function} config.waitForMessage - Function to wait for incoming message
   * @param {string} config.chatId - Target chat/user identifier
   */
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
