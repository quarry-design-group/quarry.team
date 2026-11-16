/**
 * The /compliance evidence ledger — the single source of truth for the page's
 * citations and for the regulated-environment note on cited case studies.
 *
 * Slugs resolve against the cases collection at build (pages/compliance.astro
 * throws on a miss), so a renamed or unpublished case breaks the build instead
 * of shipping a dead link. `regime` cites the framework the engagement was
 * delivered to or under; `claim` is a falsifiable sentence sourced from the
 * case body — if the case changes, keep the claim in sync.
 */
export type Evidence = { slug: string; regime: string; claim: string };

export const ledger: Evidence[] = [
  {
    slug: 'hipaa-compliant-infrastructure-mental-health-industry',
    regime: 'HIPAA · Healthcare',
    claim:
      'A multi-tenant ePHI architecture on AWS — VPC isolation, CloudTrail/CloudWatch audit logging, minimum-necessary IAM — designed HIPAA-compliant from day one.',
  },
  {
    slug: 'securing-e-commerce-swift-response-to-a-card-skimming-attack',
    regime: 'PCI DSS · Incident response',
    claim:
      'A card-skimming breach contained, the platform patched current, and the client carried through PayPal’s digital-forensic (DFIR) investigation and bank inquiries to closure.',
  },
  {
    slug: 'preventing-and-responding-to-card-testing-attacks-for-e-commerce',
    regime: 'PCI DSS · Payments',
    claim:
      'An automated card-testing attack halted within hours; payment processing restored in under two weeks — hardened, with a backup processor and anomaly alerting in place.',
  },
  {
    slug: 'from-siloed-tools-to-a-single-source-of-truth-a-data-platform-and-self-serve-bi-for-a-pharmacy-group',
    regime: 'HIPAA · Healthcare data',
    claim:
      'Four disconnected systems unified into one governed warehouse with self-serve BI, for a multi-location pharmacy group inside a growing healthcare organization.',
  },
  {
    slug: 'handling-billions-in-portfolio-calculations-with-a-fractional-team',
    regime: 'GIPS · Financial services',
    claim:
      'GIPS attestation software handling billions in composite-return calculations — years of encoded financial logic kept stable and advancing through a critical staffing transition.',
  },
  {
    slug: 'maximizing-client-opportunity-by-transforming-data-collection-for-the-cookie-less-future',
    regime: 'GDPR / CCPA / ISO/IEC 27701 · Data minimization',
    claim:
      'Client-side vendor scripts replaced with one server-side stream: sensitive parameters stripped before transmission, every vendor receiving only the minimum necessary data.',
  },
  {
    slug: 'restructuring-data-collection-creates-7-5x-faster-launches-for-a-global-gaming-brand',
    regime: 'GDPR / ISO/IEC 27701 · Global data governance',
    claim:
      'Standardized, compliant data collection across a global gaming portfolio — runbooks, an SOP wired into the development lifecycle, and data-collection launch builds cut from 15 hours to 1–2.',
  },
];
