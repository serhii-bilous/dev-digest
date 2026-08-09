import { describe, it, expect } from 'vitest';
import { deriveNameFromMarkdown, isSkillConfigChange } from '../src/modules/skills/helpers.js';

describe('isSkillConfigChange', () => {
  const existing = { name: 'a', description: 'd', type: 'custom' as const, body: 'b' };

  it('is true when body/name/description/type changes', () => {
    expect(isSkillConfigChange(existing, { body: 'new' })).toBe(true);
    expect(isSkillConfigChange(existing, { name: 'new' })).toBe(true);
    expect(isSkillConfigChange(existing, { description: 'new' })).toBe(true);
    expect(isSkillConfigChange(existing, { type: 'security' })).toBe(true);
  });

  it('is false for a no-op patch or an unrelated (enabled) field', () => {
    expect(isSkillConfigChange(existing, {})).toBe(false);
    expect(isSkillConfigChange(existing, { body: 'b' })).toBe(false);
  });
});

describe('deriveNameFromMarkdown', () => {
  it('takes the first level-1 heading', () => {
    expect(deriveNameFromMarkdown('# My Rule\nBody text.')).toBe('My Rule');
  });

  it('trims whitespace and ignores headings after the first', () => {
    expect(deriveNameFromMarkdown('#   Padded Title  \n# Second\nBody')).toBe('Padded Title');
  });

  it('falls back to a placeholder when there is no heading', () => {
    expect(deriveNameFromMarkdown('Just body text, no heading.')).toBe('Untitled skill');
  });
});
