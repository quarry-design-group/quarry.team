/**
 * Typed access to the design tokens for use in TS/JS (e.g. Tailwind config,
 * tests, Figma sync). Imported from the single source of truth, tokens.json.
 */
import tokens from '../tokens/tokens.json' with { type: 'json' };

export { tokens };

export const disciplines = ['strategy', 'design', 'engineering', 'ecommerce', 'data'] as const;
export type Discipline = (typeof disciplines)[number];

export const disciplineColor: Record<Discipline, string> = {
  strategy: tokens.color.discipline.strategy.$value,
  design: tokens.color.discipline.design.$value,
  engineering: tokens.color.discipline.engineering.$value,
  ecommerce: tokens.color.discipline.ecommerce.$value,
  data: tokens.color.discipline.data.$value,
};
