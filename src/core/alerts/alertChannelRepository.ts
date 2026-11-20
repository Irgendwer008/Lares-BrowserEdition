// SPDX-License-Identifier: GPL-3.0-or-later
import type { SecretCipher, StateStore } from '../data/appState';
import type { UnlockGate } from '../data/unlockGate';
import { utf8 } from '../unlock/bytes';
import { isDraftComplete, trimDraft, type AlertChannelConfig, type ChannelDraft } from './alertChannels';

/**
 * Guardian notification channels. Adding one is free (more oversight = tightening); editing or
 * removing needs the code (decision: changing alert channels is loosening).
 */
export class AlertChannelRepository {
  constructor(
    private readonly store: StateStore,
    private readonly gate: UnlockGate,
    private readonly cipher: SecretCipher,
  ) {}

  async all(): Promise<readonly AlertChannelConfig[]> {
    return (await this.store.current()).settings.alertChannels;
  }

  async get(id: string): Promise<AlertChannelConfig | null> {
    return (await this.all()).find((c) => c.id === id) ?? null;
  }

  /** Decrypted form for editing / sending. */
  async draftOf(config: AlertChannelConfig): Promise<ChannelDraft> {
    let secret = '';
    if (config.secretEncrypted !== null) {
      try {
        secret = new TextDecoder().decode(await this.cipher.decrypt(config.secretEncrypted));
      } catch {
        secret = '';
      }
    }
    return { type: config.type, language: config.language, server: config.server ?? '', address: config.address ?? '', secret };
  }

  /** @return the new channel id. */
  async add(draft: ChannelDraft): Promise<string> {
    const clean = trimDraft(draft);
    if (!isDraftComplete(clean)) throw new Error('incomplete channel');
    const config = await this.toConfig(globalThis.crypto.randomUUID(), clean);
    await this.store.update((s) => ({ ...s, settings: { ...s.settings, alertChannels: [...s.settings.alertChannels, config] } }));
    return config.id;
  }

  async update(id: string, draft: ChannelDraft): Promise<void> {
    const clean = trimDraft(draft);
    if (!isDraftComplete(clean)) throw new Error('incomplete channel');
    const old = await this.get(id);
    if (old === null) throw new Error(`unknown channel ${id}`);
    await this.gate.check('LOOSENING');
    const config = { ...(await this.toConfig(id, clean)), deliveredUpTo: old.deliveredUpTo };
    await this.store.update((s) => ({
      ...s,
      settings: { ...s.settings, alertChannels: s.settings.alertChannels.map((c) => (c.id === id ? config : c)) },
    }));
  }

  async remove(id: string): Promise<void> {
    if ((await this.get(id)) === null) return;
    await this.gate.check('LOOSENING');
    await this.store.update((s) => ({
      ...s,
      settings: { ...s.settings, alertChannels: s.settings.alertChannels.filter((c) => c.id !== id) },
    }));
  }

  private async toConfig(id: string, draft: ChannelDraft): Promise<AlertChannelConfig> {
    const blankToNull = (s: string) => (s.trim().length === 0 ? null : s);
    const secret = blankToNull(draft.secret);
    return {
      id,
      type: draft.type,
      language: draft.language,
      server: blankToNull(draft.server),
      address: blankToNull(draft.address),
      secretEncrypted: secret === null ? null : await this.cipher.encrypt(utf8(secret)),
      deliveredUpTo: 0,
    };
  }
}
