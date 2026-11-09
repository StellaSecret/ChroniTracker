import { describe, it, expect } from 'vitest';
import utils from '../../www/app/shared/utils.js';

describe('shared utils ids', () => {
  it('generates non-empty unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => utils.nextId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.length).toBeGreaterThan(6);
  });

  it('uid delegates to nextId', () => {
    expect(utils.uid().length).toBeGreaterThan(6);
  });
});
