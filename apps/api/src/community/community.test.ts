import { describe, expect, it } from 'vitest';
import { cleanComment, hashDevice, needsModeration } from './community.service';

describe('comunidad', () => {
  it('limpia comentarios', () => {
    expect(cleanComment('  cargó   bien\n\ta 120 kW  ')).toBe('cargó bien a 120 kW');
    expect(cleanComment('')).toBeNull();
    expect(cleanComment(42)).toBeNull();
    expect(cleanComment('x'.repeat(500))).toHaveLength(280);
  });

  it('retiene para moderación los comentarios con enlaces', () => {
    expect(needsModeration('mira www.spam.com')).toBe(true);
    expect(needsModeration('https://x.y')).toBe(true);
    expect(needsModeration('el conector 2 no va')).toBe(false);
  });

  it('nunca guarda el id del dispositivo en claro', () => {
    const id = '3f2b8c1e-1d2a-4b5c-9d8e-7f6a5b4c3d2e';
    expect(hashDevice(id)).not.toContain(id);
    expect(hashDevice(id)).toHaveLength(64);
    expect(hashDevice(id)).toBe(hashDevice(id));
  });
});
