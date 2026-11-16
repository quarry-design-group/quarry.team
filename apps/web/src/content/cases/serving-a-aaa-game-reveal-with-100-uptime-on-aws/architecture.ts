/**
 * The launch-stack diagram for this case (ArchitectureDiagram). Anonymized like
 * the entry: no client, title, vendor or place names. Figures repeat the
 * entry's own and trace to the same evidence pack; keep them in sync with it.
 */
import { defineDiagram } from '@/lib/diagram';

export default defineDiagram({
  id: 'launch-stack',
  kicker: 'Architecture · Launch stack',
  title: 'Two paths, one platform.',
  subtitle: 'Requests and consented data.',
  lanes: [
    { id: 'traffic', label: 'Site traffic' },
    { id: 'data', label: 'Marketing data', rows: 3 },
  ],
  nodes: [
    {
      id: 'visitor',
      lane: 'traffic',
      col: 0,
      kind: 'actor',
      title: 'Visitor',
      detail: 'Browser or phone',
      description: [
        'Anyone loading either site. Requests reach the nearest edge location, never the origin directly.',
      ],
    },
    {
      id: 'firewall',
      lane: 'traffic',
      col: 1,
      kind: 'key',
      badge: 'Gate',
      title: 'Edge firewall',
      detail: 'Managed attack filtering',
      note: { text: 'Closed until the reveal · opened by one switch', tone: 'accent' },
      description: [
        'Managed rules filter common exploits, known-bad inputs and abusive addresses on every site, tuned so real visitors on shared networks are not locked out at the launch moment. Enforcement is concentrated on forms and APIs.',
        'Until the reveal, a default-deny rule admitted only the client’s reviewers and turned away 487,159 requests. Going public was one reviewed change, reversible the same way.',
      ],
    },
    {
      id: 'cdn',
      lane: 'traffic',
      col: 2,
      title: 'CDN cache',
      detail: 'Served close to the visitor',
      description: [
        'Pre-built pages are cached at edge locations worldwide, so nearly every request is answered without reaching the origin: a 99.5% cache hit ratio on the primary site.',
      ],
    },
    {
      id: 'sites',
      lane: 'traffic',
      col: 3,
      title: 'Two static sites',
      detail: 'Private origins, no servers',
      description: [
        'Both sites are pre-built pages in private storage that only the CDN can read. Nothing renders at request time, so there is no server to overload.',
        'Each release is kept whole: going live or rolling back is one pointer change that takes effect at once.',
      ],
    },
    {
      id: 'browser',
      lane: 'data',
      row: 1,
      col: 0,
      kind: 'actor',
      title: 'Browser',
      detail: 'After consent only',
      note: { text: 'Nothing leaves before consent' },
      description: [
        'The consent prompt follows the privacy rules for the visitor’s market. Analytics, CRM and advertising each need their own consent; nothing optional is stored and no marketing data leaves the browser until it is granted, and withdrawing it stops the matching flow.',
      ],
    },
    {
      id: 'event-api',
      lane: 'data',
      row: 1,
      col: 1,
      title: 'Event API',
      detail: 'First-party, own domain',
      description: [
        'Events go to an API on the site’s own domain, never straight to third-party trackers. No third-party SDK or write key is loaded in the page.',
      ],
    },
    {
      id: 'outbox',
      lane: 'data',
      row: 1,
      col: 2,
      title: 'Durable outbox',
      detail: 'Encrypted, replayable',
      description: [
        'Each event is stored before it is acknowledged, with idempotent retries, a replay queue and a time-limited archive, so a destination outage loses nothing.',
      ],
    },
    {
      id: 'pipeline',
      lane: 'data',
      row: 1,
      col: 3,
      kind: 'key',
      title: 'Data pipeline',
      detail: 'Self-hosted',
      description: [
        'A self-hosted, open-source customer data pipeline that Quarry maintains forwards each event only to the destinations the visitor consented to. Email addresses leave only in hashed form.',
        '99.9% of delivery attempts succeeded.',
      ],
    },
    {
      id: 'ad-platforms',
      lane: 'data',
      row: 0,
      col: 4,
      title: 'Six ad platforms',
      detail: 'Conversion APIs',
      description: ['Consented conversion events, delivered server to server: 415,004 deliveries.'],
    },
    {
      id: 'crm',
      lane: 'data',
      row: 1,
      col: 4,
      title: 'CRM',
      detail: 'Sign-ups, double opt-in',
      description: [
        'Sign-ups from visitors who consented to CRM, confirmed through double opt-in: 49,169 deliveries.',
      ],
    },
    {
      id: 'analytics',
      lane: 'data',
      row: 2,
      col: 4,
      title: 'Analytics',
      detail: 'Site measurement',
      description: ['Consented analytics events: 200,456 deliveries.'],
    },
  ],
  groups: [{ label: 'Destinations', nodes: ['ad-platforms', 'crm', 'analytics'] }],
  flows: [
    { id: 'requests', label: 'Site requests', steps: ['visitor', 'firewall', 'cdn', 'sites'] },
    {
      id: 'ads',
      label: 'Ad conversions',
      steps: ['browser', 'event-api', 'outbox', 'pipeline', 'ad-platforms'],
    },
    {
      id: 'crm',
      label: 'CRM sign-ups',
      steps: ['browser', 'event-api', 'outbox', 'pipeline', 'crm'],
    },
    {
      id: 'analytics',
      label: 'Analytics events',
      steps: ['browser', 'event-api', 'outbox', 'pipeline', 'analytics'],
    },
  ],
  footer: {
    label: 'Foundation',
    items: [
      'Multi-account AWS',
      'Infrastructure as code',
      'Audit trail',
      'Health checks every 30 seconds',
    ],
  },
});
