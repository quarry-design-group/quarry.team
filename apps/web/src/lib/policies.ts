/**
 * The policies collection's shared vocabulary: category labels and the order
 * the index presents them in. Governance documents (how we conduct ourselves
 * and how to hold us to it) lead; the legal boilerplate follows. Lives here
 * rather than in the layout because Astro components cannot export values.
 * See ADR-0016.
 */
import type { CollectionEntry } from 'astro:content';

export type PolicyCategory = CollectionEntry<'policies'>['data']['category'];

export const POLICY_CATEGORY_ORDER: readonly PolicyCategory[] = ['governance', 'legal'];

export const categoryLabels: Record<PolicyCategory, string> = {
  governance: 'Governance',
  legal: 'Legal',
};
