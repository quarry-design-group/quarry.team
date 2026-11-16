import { describe, it, expect } from 'vitest';
import { tokens, disciplines, disciplineColor } from './index';

describe('design tokens', () => {
  it('keeps Quarry Blue as the brand primary', () => {
    expect(tokens.color.blue['500'].$value.toLowerCase()).toBe('#0c53c7');
  });
  it('defines every discipline color', () => {
    for (const d of disciplines) expect(disciplineColor[d]).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it('pairs every discipline with a tint and an ink', () => {
    const palette: Record<string, unknown> = tokens.color.discipline;
    const valueOf = (key: string) => (palette[key] as { $value?: string } | undefined)?.$value;
    for (const d of disciplines) {
      expect(valueOf(`${d}-tint`)).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(valueOf(`${d}-ink`)).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
  it('holds exactly the disciplines that carry a tint and an ink', () => {
    const bases = Object.keys(tokens.color.discipline).filter(
      (k) => !k.startsWith('$') && !k.endsWith('-tint') && !k.endsWith('-ink'),
    );
    expect(bases.sort()).toEqual([...disciplines].sort());
  });
  it('has a complete stone ramp', () => {
    for (const step of ['0', '25', '50', '100', '500', '900', '950'] as const) {
      expect(tokens.color.stone[step].$value).toMatch(/^#/);
    }
  });
});
