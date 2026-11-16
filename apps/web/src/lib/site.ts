/**
 * Site-wide configuration and constants. Single source for nav, identity,
 * contact, and SEO defaults. Real data — drawn from the Quarry Capabilities
 * Statement and the legacy site.
 */
import type { ImageMetadata } from 'astro';
import type { Discipline } from '@quarry/ui/tokens';
import onePercentLogo from '@/assets/logos/partners/one-percent-for-the-planet.svg';
import shopifyPartnerLogo from '@/assets/logos/partners/shopify-partner.svg';
import hyvaBronzeLogo from '@/assets/logos/partners/hyva-bronze.svg';
import davidBlackAvatar from '@/assets/testimonials/david-black.jpg';
import abigailSchillingAvatar from '@/assets/testimonials/abigail-schilling.jpg';
import zackFleishmanAvatar from '@/assets/testimonials/zack-fleishman.jpg';
import tonyMartinezAvatar from '@/assets/testimonials/tony-martinez.jpg';
import shervinMohseniAvatar from '@/assets/testimonials/shervin-mohseni.jpg';
import dennishKarkiAvatar from '@/content/team/avatars/dennish-karki.png';
import valentinSanguinettiAvatar from '@/content/team/avatars/valentin-sanguinetti.png';
import brendanBingerAvatar from '@/content/team/avatars/brendan-binger.png';

export const site = {
  name: 'Quarry',
  legalName: 'Quarry Design Group, LLC',
  url: 'https://quarry.team',
  founded: 2016,
  tagline: 'We build digital products that move the numbers and respect the humans.',
  /** The purpose statement. Three sentences kept as separate lines so every
   *  surface (home band, llms.txt) can preserve the cadence. */
  purpose: [
    'Quarry exists to build software that respects the humans on both sides of the screen.',
    'Products that are accessible to all while protecting privacy, attention, and autonomy.',
    'Crafted by a distributed collective grounded in equity and trust.',
  ],
  description:
    'Quarry is an elite product and engineering team: strategy, design, code, and data, end to end. $210M+ in client revenue on platforms we’ve built and maintain.',
  email: 'hello@quarry.team',
  phone: '+1-541-249-5441',
  phoneDisplay: '541.249.5441',
  address: {
    street: '122 E Main St, Suite 300-001',
    city: 'Medford',
    region: 'OR',
    postalCode: '97501',
    country: 'US',
  },
} as const;

/** A primary-nav destination. */
export type NavLink = { label: string; href: string };
/** A primary-nav entry: a direct link, or a labeled group rendered as a
 *  disclosure dropdown (desktop) / labeled section (mobile menu). */
export type NavItem = NavLink | { label: string; children: NavLink[] };

export const nav: NavItem[] = [
  { label: 'Work', href: '/work' },
  { label: 'Services', href: '/services' },
  {
    label: 'AI',
    children: [
      { label: 'AI Services', href: '/ai-services' },
      { label: 'How we use AI', href: '/how-we-use-ai' },
    ],
  },
  { label: 'Compliance', href: '/compliance' },
  { label: 'Team', href: '/team' },
  { label: 'Insights', href: '/blog' },
  { label: 'Careers', href: '/careers' },
];

/** Every nav destination, groups flattened (footer "Explore", tests). */
export const navLinks = (): NavLink[] =>
  nav.flatMap((item) => ('children' in item ? item.children : [item]));

export const primaryCta = { label: 'Start a project', href: '/contact' } as const;

// Verified live destinations (2026-06). The X, Behance, and Instagram profiles
// were retired in 2026-09 and came out with them: a `sameAs` that resolves to a
// dead profile is worse than no assertion at all. Not rendered anywhere since
// the footer's social column came out — the list survives as the single source
// for the Organization `sameAs` in Base.astro. LinkedIn keeps its own const
// below for direct references.
export const socials: { label: string; href: string }[] = [
  { label: 'Upwork', href: 'https://www.upwork.com/agencies/814291616717602816/' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/12905612' },
];

/** LinkedIn company page (also in `socials`; kept for direct references). */
export const linkedinUrl = 'https://www.linkedin.com/company/12905612';

/** Clients to surface in the logo garden (real, from legacy site). */
export const clients = [
  'WM',
  'Qualcomm',
  'Warner Bros',
  'Boston Scientific',
  'Camping World',
  'Good Sam',
  'Krafton',
  'Skybound',
  'Georgetown University',
] as const;

export type Logo = {
  name: string;
  src: string;
  /** Optical size multiplier for the logo wall (square marks read smaller than
   *  wordmarks at the same cap-height, so they get a gentle boost). Default 1. */
  scale?: number;
  /** Official brand color (stack wall: tints the label + border, and fills the
   *  icon on hover). Mixed with the foreground so it stays legible in both themes. */
  color?: string;
};

/** Client logos (real marks, rendered monochrome). Files in /public/logos/clients. */
export const clientLogos: Logo[] = [
  { name: 'WM', src: '/logos/clients/wm.svg', scale: 1.15 },
  { name: 'Qualcomm', src: '/logos/clients/qualcomm.svg' },
  { name: 'Warner Bros', src: '/logos/clients/warner-brothers.svg', scale: 1.5 },
  { name: 'Boston Scientific', src: '/logos/clients/boston-scientific.svg' },
  { name: 'Camping World', src: '/logos/clients/camping-world.svg', scale: 1.2 },
  { name: 'Good Sam', src: '/logos/clients/good-sam.svg', scale: 1.5 },
  { name: 'Krafton', src: '/logos/clients/krafton.svg' },
  { name: 'Skybound', src: '/logos/clients/skybound.svg' },
  { name: 'Georgetown University', src: '/logos/clients/georgetown.svg', scale: 1.4 },
];

/** Heritage: organizations our team came from. /public/logos/heritage.
 *  Order and roster mirror the legacy site's "where our team has worked" wall. */
// Every heritage SVG viewBox is trimmed to its ink (scripts/trim-heritage-svgs.mjs),
// so rendered height = ink height. `scale` then equalizes perceived size by ink
// area — scale = 1.82/√(aspect ratio), clamped to [0.72, 1.35] so ultra-wide
// wordmarks keep a legible cap height and square marks don't stretch the band.
export const heritageLogos: Logo[] = [
  { name: 'Microsoft', src: '/logos/heritage/microsoft.svg', scale: 0.84 },
  { name: 'Google', src: '/logos/heritage/google.svg', scale: 1.04 },
  { name: 'Amazon', src: '/logos/heritage/amazon.svg' },
  { name: 'Meta', src: '/logos/heritage/meta.svg', scale: 0.74 },
  { name: 'Upwork', src: '/logos/heritage/upwork.svg' },
  { name: 'IBM', src: '/logos/heritage/ibm.svg', scale: 1.15 },
  { name: 'Oracle', src: '/logos/heritage/oracle.svg', scale: 0.72 },
  { name: 'Adobe', src: '/logos/heritage/adobe.svg', scale: 1.35 },
  { name: 'Magento', src: '/logos/heritage/magento.svg' },
  { name: 'eBay', src: '/logos/heritage/ebay.svg', scale: 1.15 },
  { name: 'Deloitte', src: '/logos/heritage/deloitte.svg', scale: 0.73 },
  { name: 'Accenture', src: '/logos/heritage/accenture.svg', scale: 0.93 },
  { name: 'Vox Media', src: '/logos/heritage/vox-media.svg', scale: 1.35 },
  { name: 'Quora', src: '/logos/heritage/quora.svg', scale: 0.96 },
];

/** Tools of our trade — a representative, current stack. /public/logos/stacks.
 *  24 items → fills cleanly to 4×6 (and 6×4 / 3×8 / 2×12) without orphans. */
export const stackLogos: Logo[] = [
  { name: 'TypeScript', src: '/logos/stacks/typescript.svg', color: '#3178C6' },
  { name: 'React', src: '/logos/stacks/react.svg', color: '#149ECA' },
  { name: 'Next.js', src: '/logos/stacks/nextjs.svg', color: '#0070F3' },
  { name: 'Astro', src: '/logos/stacks/astro.svg', color: '#FF5D01' },
  { name: 'Vue', src: '/logos/stacks/vue.svg', color: '#42B883' },
  { name: 'Tailwind CSS', src: '/logos/stacks/tailwindcss.svg', color: '#06B6D4' },
  { name: 'Figma', src: '/logos/stacks/figma.svg', color: '#F24E1E' },
  { name: 'Node.js', src: '/logos/stacks/node.svg', color: '#5FA04E' },
  { name: 'Python', src: '/logos/stacks/python.svg', color: '#3776AB' },
  { name: 'GraphQL', src: '/logos/stacks/graphql.svg', color: '#E10098' },
  { name: 'PostgreSQL', src: '/logos/stacks/postgresql.svg', color: '#4169E1' },
  { name: 'MongoDB', src: '/logos/stacks/mongodb.svg', color: '#47A248' },
  // Data engineering — ingestion, orchestration, warehouse, transform, BI.
  { name: 'Apache Airflow', src: '/logos/stacks/airflow.svg', color: '#017CEE' },
  { name: 'Apache Spark', src: '/logos/stacks/spark.svg', color: '#E25A1C' },
  { name: 'Snowflake', src: '/logos/stacks/snowflake.svg', color: '#29B5E8' },
  { name: 'Databricks', src: '/logos/stacks/databricks.svg', color: '#FF3621' },
  { name: 'dbt', src: '/logos/stacks/dbt.svg', color: '#FF694B' },
  { name: 'Looker', src: '/logos/stacks/looker.svg', color: '#4285F4' },
  { name: 'Shopify', src: '/logos/stacks/shopify.svg', color: '#5A863E' },
  { name: 'AWS', src: '/logos/stacks/aws.svg', color: '#FF9900' },
  { name: 'Cloudflare', src: '/logos/stacks/cloudflare.svg', color: '#F38020' },
  { name: 'Docker', src: '/logos/stacks/docker.svg', color: '#2496ED' },
  { name: 'Kubernetes', src: '/logos/stacks/kubernetes.svg', color: '#326CE5' },
  { name: 'Terraform', src: '/logos/stacks/terraform.svg', color: '#7B42BC' },
];

/** Work operating software — the tools our clients run their work in. We meet
 *  teams inside their own work OS rather than forcing ours. /public/logos/workos.
 *  Rendered with the same TechStack component as the trade stack. */
// 24 items → fills cleanly to 4×6 on desktop, mirroring the trade stack.
// Dark-brand marks (Notion, Basecamp, Miro, GitHub, Zendesk) omit `color` so the
// label/hover tint falls back to the ember primary and stays legible.
export const workOsLogos: Logo[] = [
  { name: 'Jira', src: '/logos/workos/jira.svg', color: '#0052CC' },
  { name: 'Linear', src: '/logos/workos/linear.svg', color: '#5E6AD2' },
  { name: 'Asana', src: '/logos/workos/asana.svg', color: '#F06A6A' },
  { name: 'Trello', src: '/logos/workos/trello.svg', color: '#0079BF' },
  { name: 'ClickUp', src: '/logos/workos/clickup.svg', color: '#7B68EE' },
  { name: 'Basecamp', src: '/logos/workos/basecamp.svg' },
  { name: 'Notion', src: '/logos/workos/notion.svg' },
  { name: 'Confluence', src: '/logos/workos/confluence.svg', color: '#2684FF' },
  { name: 'Airtable', src: '/logos/workos/airtable.svg', color: '#18BFFF' },
  { name: 'Todoist', src: '/logos/workos/todoist.svg', color: '#E44332' },
  { name: 'Slack', src: '/logos/workos/slack.svg', color: '#4A154B' },
  { name: 'Zoom', src: '/logos/workos/zoom.svg', color: '#0B5CFF' },
  { name: 'Google Meet', src: '/logos/workos/google-meet.svg', color: '#00897B' },
  { name: 'Discord', src: '/logos/workos/discord.svg', color: '#5865F2' },
  { name: 'Miro', src: '/logos/workos/miro.svg' },
  { name: 'Loom', src: '/logos/workos/loom.svg', color: '#625DF5' },
  { name: 'Google Drive', src: '/logos/workos/google-drive.svg', color: '#4285F4' },
  { name: 'Dropbox', src: '/logos/workos/dropbox.svg', color: '#0061FF' },
  { name: 'Zapier', src: '/logos/workos/zapier.svg', color: '#FF4F00' },
  { name: 'Intercom', src: '/logos/workos/intercom.svg', color: '#1F8DED' },
  { name: 'Zendesk', src: '/logos/workos/zendesk.svg' },
  { name: 'GitHub', src: '/logos/workos/github.svg' },
  { name: 'GitLab', src: '/logos/workos/gitlab.svg', color: '#FC6D26' },
  { name: 'Bitbucket', src: '/logos/workos/bitbucket.svg', color: '#0052CC' },
];

/** Memberships & partner programs. All-SVG, imported from src/assets so they
 *  ship as hashed immutable assets. `asIs` = pre-recolored lockup, rendered
 *  un-filtered; `desat` = grayscale that preserves the mark's form (Hyvä).
 *  The rest get the footer's soft-white mono treatment. */
export type PartnerLogo = { name: string; src: ImageMetadata; asIs?: boolean; desat?: boolean };
export const partnerLogos: PartnerLogo[] = [
  { name: '1% for the Planet — Business Member', src: onePercentLogo },
  { name: 'Shopify Partner', src: shopifyPartnerLogo, asIs: true },
  { name: 'Hyvä — Bronze Partner', src: hyvaBronzeLogo, desat: true },
];

/** Compliance frameworks we design and build to in regulated environments. */
export type Framework = { abbr: string; name: string; blurb: string };
export const compliance: Framework[] = [
  {
    abbr: 'HIPAA',
    name: 'Health Insurance Portability and Accountability Act',
    blurb: 'Federal safeguards for protected health information (PHI).',
  },
  {
    abbr: 'HITRUST CSF',
    name: 'HITRUST Common Security Framework',
    blurb: 'Certifiable framework harmonizing healthcare security and privacy controls.',
  },
  {
    abbr: 'SOC 2 Type II',
    name: 'Service Organization Control 2',
    blurb: 'Audited operating effectiveness of security controls over time.',
  },
  {
    abbr: 'ISO/IEC 27001',
    name: 'Information Security Management',
    blurb: 'International standard for an information security management system.',
  },
  {
    abbr: 'ISO/IEC 27701',
    name: 'Privacy Information Management',
    blurb: 'Privacy extension to 27001 for managing personal data (PII).',
  },
  {
    abbr: 'GDPR',
    name: 'General Data Protection Regulation',
    blurb: 'EU framework governing personal-data collection, processing, and transfer.',
  },
  {
    abbr: 'CCPA / CPRA',
    name: 'California Consumer Privacy Act',
    blurb: 'California rights over collection, use, and sale of personal data.',
  },
  {
    abbr: 'COPPA',
    name: "Children's Online Privacy Protection Act",
    blurb: 'U.S. protections for the online privacy of children under 13.',
  },
  {
    abbr: 'PCI DSS',
    name: 'Payment Card Industry Data Security Standard',
    blurb: 'Controls for securely handling and storing payment-card data.',
  },
  {
    abbr: 'NIST PF 2.0',
    name: 'NIST Privacy Framework',
    blurb: 'Risk-based model for identifying and managing privacy risk.',
  },
  {
    abbr: 'NIST CSF 2.0',
    name: 'NIST Cybersecurity Framework',
    blurb: 'Govern–identify–protect–detect–respond–recover risk management.',
  },
  {
    abbr: 'CIS v8',
    name: 'CIS Critical Security Controls v8',
    blurb: 'Prioritized safeguards for modern cloud and hybrid environments.',
  },
];

export type Testimonial = {
  quote: string;
  author: string;
  role: string;
  company: string;
  /** Optional photo. When omitted, a monogram of the author's initials is shown. */
  avatar?: ImageMetadata;
};

/** Client testimonials, quoted verbatim. */
export const testimonials: Testimonial[] = [
  {
    quote:
      'We worked closely with Quarry to design every aspect of the user interface and user experience from the ground up. There were no templates! So their knowledge and experience were invaluable. They were extremely supportive and sensitive to changes in scope and budget.',
    author: 'David Black',
    role: 'eCommerce Manager',
    company: 'PJP',
    avatar: davidBlackAvatar,
  },
  {
    quote:
      'Quarry was instrumental in taking our initial ideas and turning them into a polished, phenomenal brand identity. The outcome is a solid, design-forward look that we can be proud of for years to come.',
    author: 'Abigail Schilling',
    role: 'Founder',
    company: 'Medford Cowork Collective',
    avatar: abigailSchillingAvatar,
  },
  {
    quote:
      'Having aired on Shark Tank, we had a lot of traffic and needed to meet the demands of a forward-thinking company. Quarry worked expeditiously to make sure all of our website needs were addressed. Their professionalism, creativity and friendliness will keep us coming back over and over again.',
    author: 'Zack Fleishman',
    role: 'COO',
    company: 'Shark Wheel',
    avatar: zackFleishmanAvatar,
  },
  {
    quote:
      'We have been working with Quarry for several years on multiple businesses. Their attention to detail, quick response, and the quality of their work is second to none. We highly recommend them!',
    author: 'Tony Martinez',
    role: 'Owner',
    company: 'MOMPOU · Spanish Tavern · Barcelona Cooking',
    avatar: tonyMartinezAvatar,
  },
  {
    quote:
      "It's been a pleasure working with Brendan and the Quarry team. They are extremely helpful and responsive.",
    author: 'Shervin Mohseni',
    role: 'Co-Founder',
    company: 'The Source of All · We R CBD',
    avatar: shervinMohseniAvatar,
  },
  {
    quote:
      'We brought Quarry in for one engagement and never looked back. They operate like the senior in-house team we always wished we had — opinionated where it counts, measured everywhere else, and relentless about the outcome. Our own engineers are sharper for having shipped alongside them.',
    author: 'Nel T.',
    role: 'CTO',
    company: 'B2B SaaS product (under NDA)',
  },
];

/** Staff voices — Quarry team members on their craft. Shown as the dark
 *  ink-panel interlude on the team page. `highlight` is an exact substring of
 *  `quote` the component bolds at build time. Avatars reuse the (grayscale)
 *  roster photos; locations match team.json. */
export type StaffVoice = {
  quote: string;
  highlight?: string;
  author: string;
  role: string;
  location: string;
  avatar: ImageMetadata;
};
export const staffVoices: StaffVoice[] = [
  {
    quote:
      'Engineering, to me, is solving real user needs with code that lasts. Performance, security, and accessibility aren’t afterthoughts here — they’re the culture.',
    highlight: 'they’re the culture',
    author: 'Dennish Karki',
    role: 'Senior Software Engineer',
    location: 'Nepal',
    avatar: dennishKarkiAvatar,
  },
  {
    quote:
      'Design’s job is to bring order to a chaotic, fast-moving world. The version of reality we ship is simpler, clearer, and more human.',
    highlight: 'simpler, clearer, and more human',
    author: 'Valentin Sanguinetti',
    role: 'Senior Visual Designer',
    location: 'Montevideo, Uruguay',
    avatar: valentinSanguinettiAvatar,
  },
  {
    quote:
      'We work across wildly different industries, and what we learn in one keeps showing up somewhere unrelated. That cross-pollination is what makes the work rewarding.',
    highlight: 'cross-pollination',
    author: 'Brendan Binger',
    role: 'Principal',
    location: 'Medford, Oregon',
    avatar: brendanBingerAvatar,
  },
];

/** Discipline categories — the @quarry/ui design-token discipline palette. */
export type { Discipline };

/** Firm track record, three rows of three: client value, launches, reach and
 *  standing. `tone` = discipline color, one per row. Every value is a floor
 *  (rounded down) of a figure whose formula, inputs, and coverage are
 *  published on /track-record and evidenced in the internal ledger (marketing
 *  truth policy, 2026-11). Change a value only with its ledger entry. */
export type Stat = { value: string; label: string; tone: Discipline };
export const firmStats: Stat[] = [
  // Row 1, client value
  {
    value: '$210M+',
    label: 'Client revenue on platforms we built and maintain',
    tone: 'ecommerce',
  },
  {
    value: '$40M+',
    label: 'Annual client revenue through platforms we maintain today',
    tone: 'ecommerce',
  },
  {
    value: '$3M+',
    label: 'Measured incremental value from improvements we shipped',
    tone: 'ecommerce',
  },
  // Row 2, launches
  {
    value: '$2.1B+',
    label: 'Sales across launches whose paid-media measurement we engineered',
    tone: 'strategy',
  },
  {
    value: '65M+',
    label: 'Units sold across launches we built sites and data for',
    tone: 'strategy',
  },
  {
    value: '1.6M+',
    label: 'Unique viewers of a world esports championship on the official platform we built',
    tone: 'strategy',
  },
  // Row 3, reach and standing
  {
    value: '135M+',
    label: 'Sessions on sites we built, maintain, or instrumented',
    tone: 'engineering',
  },
  {
    value: 'Top 5K',
    label: 'Web traffic rank reached by a site we built or instrumented',
    tone: 'engineering',
  },
  {
    value: '$230M+',
    label: 'Combined value of client acquisitions during our partnerships',
    tone: 'engineering',
  },
];

/** Delivery lifecycle — "What to expect" (leave-behind p14). */
export type Phase = { name: string; items: string };
export const lifecycle: Phase[] = [
  { name: 'Ideation', items: 'Problem/opportunity assessment · risk/reward analysis' },
  {
    name: 'Planning',
    items: 'Sizing · grooming · prioritization · roadmapping · alignment · capacity',
  },
  { name: 'Validation', items: 'Research · proof of concept' },
  {
    name: 'Design',
    items: 'UI/UX · prototyping · design systems · visual design · architecture · infrastructure',
  },
  { name: 'Development', items: 'Implementation · integration · deployment' },
  { name: 'Testing', items: 'QA · unit · automated · A/B/n' },
  {
    name: 'Measurement',
    items: 'Data collection · telemetry · observability · performance · error & bug collection',
  },
  { name: 'Analysis', items: 'Outcomes · learnings · impact · next steps' },
  { name: 'Maintenance', items: 'Support · remediation' },
  { name: 'Improvement', items: 'Enhancements · user/customer feedback' },
  {
    name: 'Amplification',
    items:
      'Product-led growth · lifecycle marketing · announcements · blue-green deploys · A/B/n winner promotion',
  },
  { name: 'Profit', items: 'Outcomes that compound' },
];

export type SeoProps = {
  title?: string;
  /**
   * When true, `title` is used verbatim as the document title (no
   * "— Quarry" suffix). Used by the homepage, whose title already
   * leads with the brand.
   */
  titleAbsolute?: boolean;
  description?: string;
  image?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  noindex?: boolean;
  type?: 'website' | 'article';
  /** Article metadata (cases/posts) for og:article + structured data. */
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  /** Extra JSON-LD documents to emit in <head> (Article, BreadcrumbList, …). */
  jsonLd?: Record<string, unknown>[];
};

/**
 * Countries a remote role can hire from: every ISO 3166-1 alpha-2 code (249,
 * from the ISO 3166 Maintenance Agency list as published in Debian iso-codes)
 * except Cuba (CU), Iran (IR), North Korea (KP), and Syria (SY), where US
 * comprehensive sanctions bar employment and contracting. Google requires at
 * least one country for a TELECOMMUTE JobPosting and has no worldwide value, so
 * the careers pages emit this list as `applicantLocationRequirements`.
 */
// prettier-ignore
export const hiringCountries: readonly string[] = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG',
  'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG',
  'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN',
  'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR',
  'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN',
  'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF',
  'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL',
  'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC',
  'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX',
  'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW',
  'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS',
  'YE', 'YT', 'ZA', 'ZM', 'ZW',
];
