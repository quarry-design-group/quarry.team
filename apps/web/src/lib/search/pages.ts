/**
 * The backbone pages in the search index (ADR-0021). These routes are
 * hand-authored templates with no collection entry behind them, so their
 * searchable title and summary live here. The title and summary match the
 * page's own `<Base>` props; `text` carries the few extra terms a reader
 * would search for that the summary leaves out.
 */
import type { SearchSource } from './documents';

export const backbonePages: SearchSource[] = [
  {
    url: '/',
    kind: 'page',
    title: 'Quarry — Digital products that move the numbers',
    summary:
      'Quarry is an elite product and engineering team: strategy, design, code, and data, end to end. $210M+ in client revenue on platforms we’ve built and maintain.',
    body: 'Home. Selected work, services, client logos, testimonials, and the firm track record.',
  },
  {
    url: '/services',
    kind: 'page',
    title: 'Services: strategy, design, engineering & data',
    summary:
      'One senior team across the entire product lifecycle — engage by project, embedded, or fractional. No handoffs, no juniors, and outcomes you can measure.',
    body: 'Capabilities, engagement models, and the delivery lifecycle from ideation to profit.',
  },
  {
    url: '/ai-services',
    kind: 'page',
    title: 'AI development services: AI as product & feature',
    summary:
      'We design, build, and integrate AI for clients: AI-native products and LLM features shipped with evals, guardrails, and privacy-first engineering.',
    body: 'LLM integration, retrieval, evals, guardrails, agents, and AI product strategy.',
  },
  {
    url: '/compliance',
    kind: 'page',
    title: 'Compliance: delivering in regulated environments',
    summary:
      'HIPAA architecture, PCI incident response, privacy-first data platforms: hard evidence of how Quarry delivers in regulated, high-compliance environments.',
    body: 'HIPAA, HITRUST, SOC 2, ISO 27001, ISO 27701, GDPR, CCPA, COPPA, PCI DSS, NIST, CIS. The evidence ledger.',
  },
  {
    url: '/how-we-use-ai',
    kind: 'page',
    title: 'How we use AI: senior judgment, real leverage',
    summary:
      'AI is leverage, not a license to ship slop. How Quarry applies AI deliberately: senior judgment on the wheel, every artifact held to the same gate.',
    body: 'AI policy, disclosure, and the review gate every AI-assisted artifact passes.',
  },
  {
    url: '/track-record',
    kind: 'page',
    title: 'Track record: how we count our outcomes',
    summary:
      'The formulas behind Quarry’s track record: what each figure measures, the data it comes from, and what it leaves out. Every figure is a floor.',
    body: 'Methodology, marketing truth policy, client revenue, enterprise value, sessions, conversions, measured incremental value.',
  },
  {
    url: '/team',
    kind: 'page',
    title: 'Team: senior alumni of Google, Amazon & Microsoft',
    summary:
      'A globally-distributed collective of senior product people — alumni of Microsoft, Google, Amazon, and Adobe — who do the work themselves. No handoffs.',
    body: 'The roster, locations on the globe, and staff voices on the craft.',
  },
  {
    url: '/careers',
    kind: 'page',
    title: 'Careers: 100% remote, senior, built with intention',
    summary:
      'Join a senior, globally-distributed product collective. 100% remote, flexible hours, generous time off, and real ownership — we hire people who read the source.',
    body: 'Open roles, values, benefits, and the general application form.',
  },
  {
    url: '/contact',
    kind: 'page',
    title: 'Start a project: we reply in one business day',
    summary:
      "Tell us what you're building. A senior practitioner — not an account manager — reads every inquiry and replies within one business day. Or book a 30-minute call.",
    body: 'Contact form, email, phone, and the Calendly booking link.',
  },
];
