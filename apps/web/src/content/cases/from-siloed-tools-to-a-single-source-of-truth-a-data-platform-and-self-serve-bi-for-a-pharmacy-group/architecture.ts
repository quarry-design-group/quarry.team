/**
 * The data-platform diagram for this case (ArchitectureDiagram). Anonymized
 * like the entry; card copy repeats only what the entry says.
 */
import { defineDiagram } from '@/lib/diagram';

export default defineDiagram({
  id: 'data-platform',
  kicker: 'Architecture · Data platform',
  title: 'One warehouse, two directions.',
  subtitle: 'Dashboards for every team, and flagged accounts back to the CRM.',
  geometry: { colWidth: 272 },
  lanes: [{ id: 'platform', label: 'Data platform', rows: 4 }],
  nodes: [
    {
      id: 'crm',
      lane: 'platform',
      col: 0,
      row: 0,
      kind: 'actor',
      title: 'CRM',
      detail: 'Accounts and reps',
      description: [
        'The sales team’s system of record. Its records flow into the warehouse, and the platform writes flagged accounts back into it, so a rep starts the day with that list.',
      ],
    },
    {
      id: 'pharmacy-system',
      lane: 'platform',
      col: 0,
      row: 1,
      kind: 'actor',
      title: 'Pharmacy management system',
      detail: 'Incl. emailed report files',
      description: [
        'Prescription history and patient-linked activity: protected health information under HIPAA. Its critical reports once arrived only as CSV files in shared inboxes; ingestion now pulls them in.',
      ],
    },
    {
      id: 'telephony',
      lane: 'platform',
      col: 0,
      row: 2,
      kind: 'actor',
      title: 'Telephony',
      detail: 'Calling tool',
      description: ['The calling tool’s records, pulled in alongside the other sources.'],
    },
    {
      id: 'ad-platforms',
      lane: 'platform',
      col: 0,
      row: 3,
      kind: 'actor',
      title: 'Ad platforms',
      detail: 'Meta and others',
      description: [
        'Ad platforms such as Meta, so whether ad spend moves prescription volume becomes a question the data can answer.',
      ],
    },
    {
      id: 'ingestion',
      lane: 'platform',
      col: 1,
      row: 1,
      title: 'Ingestion',
      detail: 'Services',
      description: [
        'Ingestion services connect to each source and continuously pull its records into the warehouse, including the report files once trapped in email.',
      ],
    },
    {
      id: 'warehouse',
      lane: 'platform',
      col: 2,
      row: 1,
      title: 'PostgreSQL warehouse',
      detail: 'Plus raw file storage',
      description: [
        'A managed PostgreSQL warehouse with scoped, auditable access, in place of CSV exports circulating in shared inboxes. The centralization itself closed the group’s loosest handling of PHI.',
      ],
    },
    {
      id: 'reporting',
      lane: 'platform',
      col: 3,
      row: 1,
      kind: 'key',
      title: 'Modeled reporting layer',
      detail: 'Prescriptions, activity, orders',
      description: [
        'A clean reporting layer: prescription history, customer activity and order patterns, refreshed daily, weekly and monthly. Every team works from the same data instead of raw exports.',
      ],
    },
    {
      id: 'looker',
      lane: 'platform',
      col: 4,
      row: 0,
      title: 'Looker BI',
      detail: 'Sales, marketing, operations',
      description: [
        'Self-serve dashboards for sales, marketing and operations, each team answering its own questions from one governed source.',
      ],
    },
    {
      id: 'models',
      lane: 'platform',
      col: 4,
      row: 2,
      kind: 'key',
      title: 'Business-logic models',
      detail: 'Account flags',
      description: [
        'Models that flag the accounts that matter: gone quiet, never ordered, starting to slip.',
        'Those signals are written back into the CRM (reverse ETL), so the platform queues the next call.',
      ],
    },
  ],
  groups: [
    { label: 'Analytics', nodes: ['looker'] },
    { label: 'Activation (reverse ETL)', nodes: ['models'] },
  ],
  flows: [
    { id: 'crm-in', label: 'CRM records in', steps: ['crm', 'ingestion'] },
    { id: 'pharmacy-in', label: 'Pharmacy records in', steps: ['pharmacy-system', 'ingestion'] },
    { id: 'calls-in', label: 'Call records in', steps: ['telephony', 'ingestion'] },
    { id: 'ads-in', label: 'Ad data in', steps: ['ad-platforms', 'ingestion'] },
    {
      id: 'analytics',
      label: 'Analytics',
      steps: ['ingestion', 'warehouse', 'reporting', 'looker'],
    },
    {
      id: 'activation',
      label: 'Activation',
      steps: ['ingestion', 'warehouse', 'reporting', 'models', 'crm'],
      returnLabel: 'Flagged accounts written back to the CRM',
    },
  ],
});
