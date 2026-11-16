import { makeSubmissionRoute } from '@/lib/submission-route';

// On-demand (runs on the Cloudflare Worker); everything else on the site is
// prerendered. Same-origin endpoint — the contact form POSTs here.
export const prerender = false;
export const { POST, ALL } = makeSubmissionRoute('contact');
