/**
 * The before-and-after collection diagrams for this case (ArchitectureDiagram).
 * Card copy repeats only what the entry says; the vendors are the ones it names.
 */
import { defineDiagram, type DiagramNode } from '@/lib/diagram';

const vendor = (id: string, title: string, row: number, description: string): DiagramNode => ({
  id,
  lane: 'collection',
  col: 4,
  row,
  title,
  description: [description],
});

const client: DiagramNode = {
  id: 'client',
  lane: 'collection',
  col: 0,
  row: 1,
  kind: 'actor',
  title: 'Client',
  detail: 'Website, user’s browser',
  description: ['The website, running in the user’s browser.'],
};

export const before = defineDiagram({
  id: 'collection-before',
  kicker: 'Before',
  title: 'Client-side collection.',
  subtitle: 'Vendor libraries load in the browser.',
  lanes: [{ id: 'collection', label: 'Data collection', rows: 4 }],
  nodes: [
    client,
    {
      id: 'gtm',
      lane: 'collection',
      col: 1,
      row: 1,
      title: 'GTM',
      detail: 'Client-side container',
      description: [
        'Client-side Google Tag Manager loaded each vendor’s library directly in the user’s browser: heavy third-party scripts that degraded performance, and multiple collection points that produced inconsistent data.',
      ],
    },
    ...(
      [
        ['facebook', 'Facebook', 0],
        ['google-ads', 'Google Ads', 1],
        ['tiktok', 'TikTok', 2],
        ['ga4', 'GA4', 3],
      ] as const
    ).map(([id, title, row]) => ({
      id,
      lane: 'collection',
      col: 2,
      row,
      title,
      detail: 'Client-side library',
      description: [
        `${title}’s library, loaded in the browser: exposed to browser-driven signal loss, and one more collection point.`,
      ],
    })),
    {
      id: 'server-gtm',
      lane: 'collection',
      col: 3,
      row: 3,
      title: 'Server-side GTM',
      detail: 'Fed by GA4',
      description: [
        'A server-side container fed by GA4, sending the vendors a second stream alongside their client-side libraries.',
      ],
    },
    vendor('facebook-server', 'Facebook', 0, 'Sent from the server-side container.'),
    vendor('google-ads-server', 'Google Ads', 1, 'Sent from the server-side container.'),
    vendor('tiktok-server', 'TikTok', 2, 'Sent from the server-side container.'),
    vendor('ga4-server', 'GA4', 3, 'Sent from the server-side container.'),
  ],
  containers: [
    {
      id: 'client-collection',
      label: 'Client collection',
      kind: 'group',
      contains: ['facebook', 'google-ads', 'tiktok', 'ga4'],
    },
    {
      id: 'server-collection',
      label: 'Server collection',
      kind: 'group',
      contains: ['facebook-server', 'google-ads-server', 'tiktok-server', 'ga4-server'],
    },
  ],
  flows: [
    { id: 'fb-client', label: 'Facebook, client-side', steps: ['client', 'gtm', 'facebook'] },
    { id: 'ads-client', label: 'Google Ads, client-side', steps: ['client', 'gtm', 'google-ads'] },
    { id: 'tt-client', label: 'TikTok, client-side', steps: ['client', 'gtm', 'tiktok'] },
    { id: 'ga4-client', label: 'GA4, client-side', steps: ['client', 'gtm', 'ga4'] },
    {
      id: 'fb-server',
      label: 'Facebook, server-side',
      steps: ['client', 'gtm', 'ga4', 'server-gtm', 'facebook-server'],
    },
    {
      id: 'ads-server',
      label: 'Google Ads, server-side',
      steps: ['client', 'gtm', 'ga4', 'server-gtm', 'google-ads-server'],
    },
    {
      id: 'tt-server',
      label: 'TikTok, server-side',
      steps: ['client', 'gtm', 'ga4', 'server-gtm', 'tiktok-server'],
    },
    {
      id: 'ga4-server',
      label: 'GA4, server-side',
      steps: ['client', 'gtm', 'ga4', 'server-gtm', 'ga4-server'],
    },
  ],
});

export const after = defineDiagram({
  id: 'collection-after',
  kicker: 'After',
  title: 'Server-side collection.',
  subtitle: 'One stream out of the browser; the server dispatches to every vendor.',
  lanes: [{ id: 'collection', label: 'Data collection', rows: 4 }],
  nodes: [
    client,
    {
      id: 'gtm',
      lane: 'collection',
      col: 1,
      row: 1,
      title: 'GTM',
      detail: 'Streams to GA4 only',
      description: [
        'Client-side GTM is used solely to stream data to the server-side container, with GA4 tags as the conduit. No vendor library loads in the browser.',
      ],
    },
    {
      id: 'ga4',
      lane: 'collection',
      col: 2,
      row: 1,
      title: 'GA4',
      detail: 'The single data stream',
      description: [
        'GA4 tags carry one data stream to the server-side container, in place of multiple client-side collection points.',
      ],
    },
    {
      id: 'server-gtm',
      lane: 'collection',
      col: 3,
      row: 1,
      kind: 'key',
      title: 'Server-side GTM',
      detail: 'The central hub',
      description: [
        'The central hub that dispatches data to every vendor. Data can be transformed before it leaves (for example, stripping parameters a vendor’s policy flags), and each vendor receives only the minimum it needs.',
        'It also sets first-party cookies with a 12-month lifetime, in place of the previous seven days.',
      ],
    },
    vendor(
      'facebook',
      'Facebook',
      0,
      'Receives only what it needs, from the server-side container.',
    ),
    vendor(
      'google-ads',
      'Google Ads',
      1,
      'Receives only what it needs, from the server-side container.',
    ),
    vendor('tiktok', 'TikTok', 2, 'Receives only what it needs, from the server-side container.'),
    vendor('ga4-server', 'GA4', 3, 'Receives only what it needs, from the server-side container.'),
  ],
  containers: [
    { id: 'client-collection', label: 'Client collection', kind: 'group', contains: ['ga4'] },
    {
      id: 'server-collection',
      label: 'Server collection',
      kind: 'group',
      contains: ['facebook', 'google-ads', 'tiktok', 'ga4-server'],
    },
  ],
  flows: (
    [
      ['facebook', 'Facebook'],
      ['google-ads', 'Google Ads'],
      ['tiktok', 'TikTok'],
      ['ga4-server', 'GA4'],
    ] as const
  ).map(([to, name]) => ({
    id: `to-${to}`,
    label: `${name}, server-side`,
    steps: ['client', 'gtm', 'ga4', 'server-gtm', to],
  })),
});
