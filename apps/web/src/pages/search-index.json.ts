/**
 * /search-index.json — the site's search index, built once at build time and
 * shipped as a static asset (ADR-0021). One document per public page: every
 * published case, post, service, role and policy from the collections, plus
 * the backbone pages listed in src/lib/search/pages.ts. Drafts, cases marked
 * `comingSoon` and the interactive grievance pages are left out. The
 * on-demand /search route loads this file through the assets binding once
 * per isolate; browsers never fetch it.
 */
export const prerender = true;

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildDocuments, type SearchSource } from '@/lib/search/documents';
import { buildIndex, serializeIndex } from '@/lib/search/engine';
import { backbonePages } from '@/lib/search/pages';

export const GET: APIRoute = async () => {
  const [cases, posts, services, roles, policies] = await Promise.all([
    getCollection('cases'),
    getCollection('posts'),
    getCollection('services'),
    getCollection('roles'),
    getCollection('policies'),
  ]);

  const sources: SearchSource[] = [
    ...cases.map((c) => ({
      url: `/work/${c.id}`,
      kind: 'case' as const,
      title: c.data.title,
      summary: c.data.summary,
      disciplines: c.data.disciplines,
      body: c.body,
      draft: c.data.draft,
      comingSoon: c.data.comingSoon,
    })),
    ...posts.map((p) => ({
      url: `/blog/${p.id}`,
      kind: 'post' as const,
      title: p.data.title,
      summary: p.data.description,
      body: p.body,
      draft: p.data.draft,
    })),
    ...services.map((s) => ({
      url: `/services#${s.id}`,
      kind: 'service' as const,
      title: s.data.title,
      summary: s.data.summary,
      disciplines: s.data.discipline ? [s.data.discipline] : [],
      body: s.data.capabilities.join('. '),
    })),
    ...roles.map((r) => ({
      url: `/careers/${r.id}`,
      kind: 'role' as const,
      title: r.data.title,
      summary: r.data.summary,
      body: r.body,
      draft: r.data.draft,
    })),
    ...policies.map((p) => ({
      url: `/policies/${p.id}`,
      kind: 'policy' as const,
      title: p.data.title,
      summary: p.data.summary,
      body: p.body,
      draft: p.data.draft,
      interactive: p.data.interactive,
    })),
    ...backbonePages,
  ];

  const index = buildIndex(buildDocuments(sources));
  return new Response(JSON.stringify(serializeIndex(index)), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};
