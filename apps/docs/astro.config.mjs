// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  // Live at docs.quarry.team — an assets-only Worker (`apps/docs/wrangler.toml`)
  // deployed by .github/workflows/deploy-docs.yml; see docs/runbooks/deploy.md.
  // The canonical docs are the Markdown under `docs/` in the repo root; this app
  // is a generated mirror of them: `scripts/sync-docs.mjs` (run as `prebuild`)
  // projects `docs/` into `src/content/docs/`, and CI fails on any drift. Never
  // hand-edit the generated sections; edit `docs/` and re-run the sync.
  site: 'https://docs.quarry.team',
  integrations: [
    starlight({
      title: 'Quarry Docs',
      description: 'Documentation, user guides, and architecture for quarry.team.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/quarry-design-group/quarry.team',
        },
      ],
      sidebar: [
        { label: 'Start here', items: [{ label: 'Overview', link: '/' }] },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Architecture', items: [{ autogenerate: { directory: 'architecture' } }] },
        { label: 'Requirements', items: [{ autogenerate: { directory: 'requirements' } }] },
        { label: 'Runbooks', items: [{ autogenerate: { directory: 'runbooks' } }] },
      ],
    }),
  ],
});
