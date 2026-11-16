import { describe, it, expect } from 'vitest';
import { monogram } from './monogram';

describe('monogram', () => {
  it('takes the initials of the first two words', () => {
    expect(monogram('Brendan Binger')).toBe('BB');
    expect(monogram('Mateus William Tomaz Gebien')).toBe('MW');
  });
  it('uppercases and strips punctuation', () => {
    expect(monogram('acme (confidential) co.')).toBe('AC');
    expect(monogram('WM (Waste Management)')).toBe('WW');
    expect(monogram('Nel T.')).toBe('NT');
  });
  it('keeps letters outside ASCII', () => {
    expect(monogram('Élodie Ørsted')).toBe('ÉØ');
  });
  it('tolerates surrounding and repeated whitespace', () => {
    expect(monogram('  Leap   Sim ')).toBe('LS');
  });
  it('returns a single initial for a one-word name', () => {
    expect(monogram('Qualcomm')).toBe('Q');
  });
  it('prefers existing capitals when asked', () => {
    expect(monogram('VP of Engineering', { preferCapitals: true })).toBe('VP');
    expect(monogram('VP of Engineering')).toBe('VO');
    expect(monogram('david black', { preferCapitals: true })).toBe('DB');
  });
});
