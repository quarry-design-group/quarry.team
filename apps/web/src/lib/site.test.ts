import { describe, it, expect } from 'vitest';
import { site, nav, navLinks, socials, clients, primaryCta } from './site';

describe('site config', () => {
  it('has a canonical https url with no trailing slash', () => {
    expect(site.url).toMatch(/^https:\/\//);
    expect(site.url.endsWith('/')).toBe(false);
  });
  it('exposes the primary navigation', () => {
    expect(nav.length).toBeGreaterThanOrEqual(4);
    // Every destination (groups flattened) is a root-relative path, and
    // groups are non-empty — a childless group would render a dead trigger.
    for (const link of navLinks()) expect(link.href.startsWith('/')).toBe(true);
    for (const item of nav) {
      if ('children' in item) expect(item.children.length).toBeGreaterThan(0);
    }
  });
  it('primary CTA points at contact', () => {
    expect(primaryCta.href).toBe('/contact');
  });
  it('lists real clients and socials', () => {
    expect(clients).toContain('WM');
    expect(socials.every((s) => s.href.startsWith('https://'))).toBe(true);
  });
});
