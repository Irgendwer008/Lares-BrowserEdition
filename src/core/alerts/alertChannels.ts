// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Where guardian notifications go. See docs/notifications.md.
 *
 * Browser port: Android also has EMAIL (SMTP). Extensions can't open raw sockets, so it is not a
 * value here at all; [parseChannelConfig] drops stored / imported EMAIL channels (and any other
 * unknown type) instead of keeping an unusable enum value around.
 */
export type ChannelType = 'TELEGRAM' | 'NTFY' | 'WEBHOOK' | 'MATRIX';
export const CHANNEL_TYPES: readonly ChannelType[] = ['TELEGRAM', 'NTFY', 'WEBHOOK', 'MATRIX'];

/**
 * A configured notification channel as stored. The secret (bot token / access token) is only kept
 * encrypted ([secretEncrypted], see SecretCipher); everything else is plain.
 *
 * Field use per type:
 * - TELEGRAM: address = chat id, secret = bot token
 * - NTFY:     server = server URL, address = topic, secret = optional access token
 * - WEBHOOK:  server = URL, secret = optional bearer token
 * - MATRIX:   server = homeserver URL, address = room id, secret = access token
 *
 * The Android EMAIL-only fields (port, startTls, username, sender) are not carried over.
 */
export interface AlertChannelConfig {
  readonly id: string;
  readonly type: ChannelType;
  /** Message language (BCP 47, e.g. "en", "de") – the guardian may speak another language. */
  readonly language: string;
  readonly server: string | null;
  readonly address: string | null;
  readonly secretEncrypted: string | null;
  /** Highest tamper event id sent through this channel (each channel catches up on its own). */
  readonly deliveredUpTo: number;
}

/** Reads a stored channel; null for unknown types (e.g. Android's EMAIL) or broken entries. */
export function parseChannelConfig(raw: unknown): AlertChannelConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !CHANNEL_TYPES.includes(r.type as ChannelType)) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    id: r.id,
    type: r.type as ChannelType,
    language: str(r.language) ?? 'en',
    server: str(r.server),
    address: str(r.address),
    secretEncrypted: str(r.secretEncrypted),
    deliveredUpTo: typeof r.deliveredUpTo === 'number' ? r.deliveredUpTo : 0,
  };
}

/** Editable, decrypted form of a channel (only in memory). */
export interface ChannelDraft {
  readonly type: ChannelType;
  readonly language: string;
  readonly server: string;
  readonly address: string;
  readonly secret: string;
}

export const NTFY_DEFAULT_SERVER = 'https://ntfy.sh';

/** e.g. `123456789:AAF…` (bot id, colon, secret). */
const TELEGRAM_TOKEN = /^[0-9]+:[A-Za-z0-9_-]{20,}$/;
/** Numeric chat id; groups / channels are negative (e.g. `-1001234567890`). */
const TELEGRAM_CHAT_ID = /^-?[0-9]+$/;
/** `Char.isISOControl()`. */
// eslint-disable-next-line no-control-regex
const ISO_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

export function channelDraft(type: ChannelType, fields: Partial<Omit<ChannelDraft, 'type'>> = {}): ChannelDraft {
  return { type, language: 'en', server: '', address: '', secret: '', ...fields };
}

export function emptyDraft(type: ChannelType, language: string): ChannelDraft {
  return channelDraft(type, { language, server: type === 'NTFY' ? NTFY_DEFAULT_SERVER : '' });
}

/** An https URL with a real host (no spaces, no empty host like `https://@`). */
function isHttps(url: string): boolean {
  const u = url.trim();
  if (!u.toLowerCase().startsWith('https://') || /\s/.test(u)) return false;
  try {
    return new URL(u).hostname.trim().length > 0;
  } catch {
    return false;
  }
}

/** Required fields filled in and URLs use HTTPS (credentials never go over plain HTTP). */
export function isDraftComplete(d: ChannelDraft): boolean {
  if ([d.server, d.address, d.secret].some((f) => ISO_CONTROL.test(f))) return false;
  switch (d.type) {
    case 'TELEGRAM':
      return TELEGRAM_TOKEN.test(d.secret.trim()) && TELEGRAM_CHAT_ID.test(d.address.trim());
    case 'NTFY':
      return isHttps(d.server) && d.address.trim().length > 0;
    case 'WEBHOOK':
      return isHttps(d.server);
    case 'MATRIX':
      return isHttps(d.server) && d.address.startsWith('!') && d.address.includes(':') && d.secret.trim().length > 0;
  }
}

export function trimDraft(d: ChannelDraft): ChannelDraft {
  return { ...d, server: d.server.trim().replace(/\/+$/, ''), address: d.address.trim(), secret: d.secret.trim() };
}

/** Sends messages through a channel (HTTPS; implemented in the platform layer). */
export interface AlertSender {
  /** @throws on failure. */
  send(draft: ChannelDraft, title: string, text: string): Promise<void>;

  /** Telegram helper: reads the chat id of the latest message sent to the bot (e.g. "/start"). */
  detectTelegramChatId(botToken: string): Promise<string>;
}
