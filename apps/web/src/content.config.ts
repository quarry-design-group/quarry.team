/**
 * Content collections — the typed, git-based content model (no CMS server, no
 * external content API). Schemas are validated at build (Zod), so malformed
 * content fails the build rather than shipping. See ADR-0004 (content model).
 */
import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';
import { disciplines } from '@quarry/ui/tokens';

/**
 * Meta-description hygiene for the SEO description path: 70-160 characters
 * and no migration-era truncation ellipsis. Anything outside that range is
 * either too thin to earn the SERP pixel space or gets rewritten by Google.
 */
const isValidSeoDescription = (d: string) =>
  d.trim().length >= 70 && d.trim().length <= 160 && !/(\.\.\.|…)$/.test(d.trim());
const SEO_DESCRIPTION_MESSAGE =
  'SEO description must be 70-160 characters and must not end in an ellipsis';

/** Case studies — the crown jewels. Outcome-led structure. */
const cases = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/cases' }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        client: z.string(),
        summary: z.string(),
        disciplines: z.array(z.enum(disciplines)).default([]),
        industry: z.string().optional(),
        // The approved outcome model: a declarative headline (qualitative welcome),
        // an optional 1-2 word kicker, and numerals ONLY where they're genuine.
        outcome: z
          .object({
            // 1-2 word bold opener with real punctuation ("Acquired.").
            kicker: z.string().optional(),
            // Required falsifiable declarative sentence, sourced from the body.
            headline: z.string(),
            // Genuine numerals ONLY — no words-as-stats.
            stat: z.object({ value: z.string(), label: z.string() }).optional(),
            // At most two additional TRUE numbers from the body.
            supporting: z
              .array(z.object({ value: z.string(), label: z.string() }))
              .max(2)
              .default([]),
          })
          .refine((o) => o.supporting.length === 0 || !!o.stat, {
            message: 'supporting requires stat',
          }),
        role: z.string().optional(),
        duration: z.string().optional(),
        team: z.string().optional(),
        releasedDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        hero: image().optional(),
        heroAlt: z.string().default(''),
        // Photo credit for the hero, rendered as a caption directly beneath it.
        heroCredit: z.string().optional(),
        featured: z.boolean().default(false),
        order: z.number().default(0),
        comingSoon: z.boolean().default(false),
        draft: z.boolean().default(false),
        seo: z
          .object({
            title: z.string().optional(),
            description: z
              .string()
              .refine(isValidSeoDescription, SEO_DESCRIPTION_MESSAGE)
              .optional(),
          })
          .optional(),
      })
      .superRefine((data, ctx) => {
        // The meta description is seo.description ?? summary - whichever ships
        // must pass hygiene, so a missing seo block can't smuggle in a bad summary.
        if (!data.seo?.description && !isValidSeoDescription(data.summary)) {
          ctx.addIssue({ code: 'custom', path: ['summary'], message: SEO_DESCRIPTION_MESSAGE });
        }
        // Hero images must ship meaningful alt text.
        if (data.hero && data.heroAlt.trim().length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['heroAlt'],
            message: 'heroAlt is required when hero is set',
          });
        }
      }),
});

/** Insights / blog. */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/posts' }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        description: z.string().refine(isValidSeoDescription, SEO_DESCRIPTION_MESSAGE),
        publishedDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        author: z.string().default('Quarry'),
        category: z.string().optional(),
        tags: z.array(z.string()).default([]),
        hero: image().optional(),
        heroAlt: z.string().default(''),
        // Photo credit for the hero, rendered as a caption directly beneath it.
        heroCredit: z.string().optional(),
        draft: z.boolean().default(false),
      })
      .superRefine((data, ctx) => {
        if (data.hero && data.heroAlt.trim().length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['heroAlt'],
            message: 'heroAlt is required when hero is set',
          });
        }
      }),
});

/** FP-safe "at most 1 decimal place" check for the team globe coordinates. */
const cityLevel = (n: number) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9;
const COORD_PRECISION_MESSAGE =
  'Team coordinates must be city-level: at most 1 decimal place (privacy floor)';

/** Team members (data collection). */
const team = defineCollection({
  loader: file('./src/content/team/team.json'),
  schema: ({ image }) =>
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      location: z.string().optional(),
      bio: z.string().optional(),
      // Relative to team.json (e.g. ./avatars/brendan-binger.png) — run through
      // the image pipeline and rendered with <Image> at display size.
      avatar: image().optional(),
      // Globe-pin coordinates: CITY-LEVEL ONLY, max 1 decimal place (~10 km).
      // This is a privacy floor — never commit a geocoded address for a named
      // person; the dot-lattice globe can't resolve finer anyway. Enforced
      // here so a fine-grained coordinate fails the build.
      lat: z.number().refine(cityLevel, COORD_PRECISION_MESSAGE).optional(),
      lng: z.number().refine(cityLevel, COORD_PRECISION_MESSAGE).optional(),
      order: z.number().default(0),
    }),
});

/** Services / capabilities (data collection). */
const services = defineCollection({
  loader: file('./src/content/services/services.json'),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    capabilities: z.array(z.string()).default([]),
    discipline: z.enum(disciplines).optional(),
    order: z.number().default(0),
  }),
});

/** Open roles — careers listings with an MDX body for the full description. */
const roles = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/roles' }),
  schema: z.object({
    title: z.string(),
    team: z.string(),
    location: z.string().default('Remote — global'),
    type: z.string().default('Full-time'),
    summary: z.string(),
    datePosted: z.coerce.date(),
    validThrough: z.coerce.date().optional(),
    order: z.number().default(0),
    draft: z.boolean().default(false),
  }),
});

/**
 * Policies — the governance class of documents (legal terms, privacy, the
 * stakeholder grievance mechanism, and whatever follows: accessibility
 * statement, responsible-marketing policy, impact reporting). One collection
 * so the /policies index, the footer, and the sitemap share a single source.
 * Routes: /policies/<slug>. See ADR-0016.
 */
const policyCategories = ['governance', 'legal'] as const;

const policies = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/policies' }),
  schema: z.object({
    title: z.string(),
    // The index blurb and the meta description: SEO hygiene applies.
    summary: z.string().refine(isValidSeoDescription, SEO_DESCRIPTION_MESSAGE),
    category: z.enum(policyCategories),
    updated: z.coerce.date(),
    // The ROLE accountable for the document, never a person's name: people
    // change, and a name on a policy page rots.
    owner: z.string().optional(),
    order: z.number().default(0),
    // Rendered by a dedicated on-demand route (a form, a live process) instead
    // of the static [...slug] template; the index and footer still list it.
    interactive: z.boolean().default(false),
    // Thin legal boilerplate stays out of the sitemap (crawl focus). Governance
    // documents that stakeholders search for stay in.
    sitemap: z.boolean().default(true),
    draft: z.boolean().default(false),
  }),
});

export const collections = { cases, posts, team, services, roles, policies };
