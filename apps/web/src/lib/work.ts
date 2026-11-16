/**
 * The case library's shared vocabulary: the discipline order and labels,
 * the copy of each prerendered discipline view (`/work/discipline/<d>`), the
 * publication predicate and the one ordering every grid uses. Lives here
 * rather than in a component because Astro components cannot export values.
 */
import type { CollectionEntry } from 'astro:content';

export type Case = CollectionEntry<'cases'>;
export type Discipline = Case['data']['disciplines'][number];

/** Filter-bar and chip order. */
export const disciplineOrder: readonly Discipline[] = [
  'strategy',
  'design',
  'engineering',
  'ecommerce',
  'data',
];

export const disciplineLabels: Record<Discipline, string> = {
  strategy: 'Strategy',
  design: 'Design',
  engineering: 'Engineering',
  ecommerce: 'eCommerce',
  data: 'Data',
};

export type DisciplineView = {
  /** Document title (the layout appends the brand). */
  title: string;
  /** The h1. */
  heading: string;
  /** Meta description and intro, 70–160 characters. */
  description: string;
  /** The `services` entry (and `/services#<id>` anchor) that covers this
   *  discipline; strategy and design share one practice. */
  serviceId: string;
};

/** One landing page per discipline, written from the matching service's copy. */
export const disciplineViews: Record<Discipline, DisciplineView> = {
  strategy: {
    title: 'Strategy work: product ownership case studies',
    heading: 'Strategy that owns the outcome.',
    description:
      'Case studies where Quarry owned product strategy: discovery, roadmaps, and prioritization that turned constraints into measurable growth.',
    serviceId: 'strategy-design',
  },
  design: {
    title: 'Design work: UX/UI and brand case studies',
    heading: 'Design with the numbers attached.',
    description:
      'Case studies where Quarry led UX research, UI design, design systems, and brand identity, with the conversion and revenue outcomes each produced.',
    serviceId: 'strategy-design',
  },
  engineering: {
    title: 'Engineering work: full-stack case studies',
    heading: 'Engineering built to last.',
    description:
      'Case studies where Quarry engineered web and mobile applications, platforms, and infrastructure for reliability, speed, and scale.',
    serviceId: 'engineering',
  },
  ecommerce: {
    title: 'eCommerce work: storefront and revenue case studies',
    heading: 'Commerce that moves revenue.',
    description:
      'Case studies where Quarry engineered storefronts on Shopify, Magento, and headless stacks: launches, conversion lifts, and incident response.',
    serviceId: 'ecommerce',
  },
  data: {
    title: 'Data & Modernization work: case studies',
    heading: 'Data platforms and modernization.',
    description:
      'Case studies where Quarry built privacy-first data collection, data platforms, and self-serve BI, and modernized legacy systems without losing what worked.',
    serviceId: 'data',
  },
};

/** Root-relative URL of a discipline view. */
export const disciplineHref = (d: Discipline) => `/work/discipline/${d}`;

/** Listed in the library: published and not a placeholder. */
export const isPublished = (c: Case) => !c.data.draft && !c.data.comingSoon;

/** Library order: the curated `order`, then newest release. */
export const byCaseOrder = (a: Case, b: Case) =>
  a.data.order - b.data.order || b.data.releasedDate.getTime() - a.data.releasedDate.getTime();
