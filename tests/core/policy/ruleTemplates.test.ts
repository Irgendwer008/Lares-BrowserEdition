// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { RuleRepository } from '@/core/data/ruleRepository';
import { UnlockGate } from '@/core/data/unlockGate';
import { RuleTemplates, templateTargets } from '@/core/policy/ruleTemplates';
import { FakeClock, FakeGroupStore, FakeRuleStore, FakeStateStore } from '../../testing/fakes';

describe('RuleTemplates', () => {
  test('all targets are valid and unique', () => {
    const ids = RuleTemplates.all.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of RuleTemplates.all) {
      expect(template.websites.length, template.name).toBeGreaterThan(0);
      for (const [type, target] of templateTargets(template)) {
        expect(RuleRepository.normalizeTarget(type, target), `${template.id}: ${target}`).toBe(target);
      }
    }
  });

  test('brand color lookup', () => {
    const youtubeRed = 0xffff0000;
    expect(RuleTemplates.colorFor('WEBSITE', 'youtube.com/shorts')).toBe(youtubeRed);
    expect(RuleTemplates.colorFor('WEBSITE', 'm.youtube.com')).toBe(youtubeRed);
    expect(RuleTemplates.colorFor('WEBSITE', 'linkedin.com')).toBe(0xff0a66c2);
    expect(RuleTemplates.colorFor('WEBSITE', 'example.org')).toBeNull();
    expect(RuleTemplates.colorFor('APP', 'org.schabi.newpipe')).toBeNull(); // app targets aren't part of the templates here
  });

  test('adding a template skips what is already blocked', async () => {
    const store = new FakeRuleStore();
    const repo = new RuleRepository(store, new FakeGroupStore(store), new UnlockGate(new FakeStateStore(), new FakeClock()));
    const youtube = RuleTemplates.all.find((t) => t.id === 'youtube')!;
    const targets = templateTargets(youtube);
    await repo.add('WEBSITE', 'youtube.com');

    expect(await repo.addAll(targets, 30)).toBe(targets.length - 1);
    expect((await store.all()).length).toBe(targets.length);
    expect(await repo.addAll(targets, null)).toBe(0);
  });
});
