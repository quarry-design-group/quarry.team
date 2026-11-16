/**
 * Deterministic scope class for build-time generated style blocks (ADR-0015).
 *
 * The strict CSP hash-pins every inline style, which rules out per-element
 * `style=""` attributes (those need CSP's 'unsafe-hashes' weakening). Components
 * that used to stamp per-instance CSS custom properties inline instead emit a
 * generated `<style is:inline set:html>` block whose rules target this scope
 * class. The id is a pure hash of the instance's data, so identical props →
 * identical class + block (stable CSP hashes, no per-build churn), and two
 * differing instances on one page can't collide.
 */
export const styleScope = (prefix: string, seed: string): string => {
  let h = 5381; // djb2 — tiny, stable, good enough for a class-name nonce
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${h.toString(36)}`;
};
