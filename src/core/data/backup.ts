// SPDX-License-Identifier: GPL-3.0-or-later
import { RULE_TYPES, type RuleType } from '../policy/rule';

export const BACKUP_FORMAT = 'lares-rules';

/**
 * Exported rules and groups – the same JSON as the Android app's export (kotlinx.serialization
 * field names, `encodeDefaults = true`, nulls written out), so files move between phone and
 * browser. Contains no readable secrets and no usage data. Groups are referenced by name.
 * Optionally the TOTP secret, encrypted with the recovery code ([guardianTotp], see TotpTransfer).
 * APP rules from the phone are imported and exported again, but not enforced.
 */
export interface BackupFile {
  readonly format: string;
  readonly groups: readonly BackupGroup[];
  readonly rules: readonly BackupRule[];
  /** Encrypted authenticator secret (older Lares versions ignore it). */
  readonly guardianTotp: string | null;
}

export interface BackupGroup {
  readonly name: string;
  readonly limitMinutesPerDay: number | null;
  readonly enabled: boolean;
}

export interface BackupRule {
  readonly type: RuleType;
  readonly target: string;
  readonly limitMinutesPerDay: number | null;
  readonly enabled: boolean;
  /** Name of the group, or null for a single rule. */
  readonly group: string | null;
}

export function backupFile(changes: Partial<BackupFile> = {}): BackupFile {
  return { format: BACKUP_FORMAT, groups: [], rules: [], guardianTotp: null, ...changes };
}

export function backupGroup(name: string, changes: Partial<Omit<BackupGroup, 'name'>> = {}): BackupGroup {
  return { name, limitMinutesPerDay: null, enabled: true, ...changes };
}

export function backupRule(type: RuleType, target: string, changes: Partial<Omit<BackupRule, 'type' | 'target'>> = {}): BackupRule {
  return { type, target, limitMinutesPerDay: null, enabled: true, group: null, ...changes };
}

/** Result of RuleRepository.importBackup. */
export interface ImportResult {
  readonly groupsAdded: number;
  readonly rulesAdded: number;
  readonly skipped: number;
}

class NotARulesFile extends Error {
  constructor() {
    super('not a Lares rules file');
    this.name = 'NotARulesFile';
  }
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Field readers with kotlinx semantics: missing → default, wrong type or null for a non-null field → error. */
function field<T>(o: Json, key: string, def: T | undefined, check: (v: unknown) => v is T): T {
  if (!(key in o)) {
    if (def === undefined) throw new NotARulesFile();
    return def;
  }
  const v = o[key];
  if (!check(v)) throw new NotARulesFile();
  return v;
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
const nullable =
  <T>(check: (v: unknown) => v is T) =>
  (v: unknown): v is T | null =>
    v === null || check(v);
const isArray = (v: unknown): v is unknown[] => Array.isArray(v);
const isRuleType = (v: unknown): v is RuleType => RULE_TYPES.includes(v as RuleType);

export const BackupCodec = {
  /** Pretty-printed JSON like the Android export (4-space indent, defaults and nulls included). */
  encode(backup: BackupFile): string {
    const ordered = {
      format: backup.format,
      groups: backup.groups.map((g) => ({ name: g.name, limitMinutesPerDay: g.limitMinutesPerDay, enabled: g.enabled })),
      rules: backup.rules.map((r) => ({
        type: r.type,
        target: r.target,
        limitMinutesPerDay: r.limitMinutesPerDay,
        enabled: r.enabled,
        group: r.group,
      })),
      guardianTotp: backup.guardianTotp,
    };
    return JSON.stringify(ordered, null, 4);
  },

  /** Unknown keys are ignored. @throws Error if it isn't a Lares rules file. */
  decode(text: string): BackupFile {
    let o: unknown;
    try {
      o = JSON.parse(text);
    } catch {
      throw new NotARulesFile();
    }
    if (!isObject(o)) throw new NotARulesFile();
    const groups = field(o, 'groups', [], isArray).map((g): BackupGroup => {
      if (!isObject(g)) throw new NotARulesFile();
      return {
        name: field(g, 'name', undefined, isString),
        limitMinutesPerDay: field(g, 'limitMinutesPerDay', null, nullable(isInt)),
        enabled: field(g, 'enabled', true, isBool),
      };
    });
    const rules = field(o, 'rules', [], isArray).map((r): BackupRule => {
      if (!isObject(r)) throw new NotARulesFile();
      return {
        type: field(r, 'type', undefined, isRuleType),
        target: field(r, 'target', undefined, isString),
        limitMinutesPerDay: field(r, 'limitMinutesPerDay', null, nullable(isInt)),
        enabled: field(r, 'enabled', true, isBool),
        group: field(r, 'group', null, nullable(isString)),
      };
    });
    const backup: BackupFile = {
      format: field(o, 'format', BACKUP_FORMAT, isString),
      groups,
      rules,
      guardianTotp: field(o, 'guardianTotp', null, nullable(isString)),
    };
    if (backup.format !== BACKUP_FORMAT) throw new NotARulesFile();
    return backup;
  },
};
