import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { site } from '@/lib/site';
import type { APIContext } from 'astro';

/**
 * Readable summary content for feed readers: the first few paragraphs of the
 * MDX body with markup stripped (MDX can't be rendered to HTML here without
 * pulling the whole component pipeline into the endpoint).
 */
function summaryHtml(body: string | undefined): string | undefined {
  if (!body) return undefined;
  const esc = (s: string) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const paragraphs = body
    .replace(/^(import|export) .*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → text
    .replace(/<[^>]+>/g, '') // JSX/HTML tags
    .replace(/^#{1,6}\s+/gm, '') // heading markers
    .replace(/[*_`]/g, '')
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);
  if (paragraphs.length === 0) return undefined;
  return paragraphs.map((p) => `<p>${esc(p)}</p>`).join('');
}

export async function GET(context: APIContext) {
  const posts = (await getCollection('posts'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.publishedDate.getTime() - a.data.publishedDate.getTime());

  return rss({
    title: 'Quarry — Insights',
    description: 'Points of view on product, engineering, data, and building things well.',
    site: context.site ?? site.url,
    // Item links and guids match the canonical, unslashed URLs.
    trailingSlash: false,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedDate,
      link: `/blog/${post.id}`,
      // RSS 2.0 author is "email (name)".
      author: `${site.email} (${post.data.author})`,
      categories: [post.data.category, ...post.data.tags].filter(
        (c): c is string => typeof c === 'string' && c.length > 0,
      ),
      content: summaryHtml(post.body),
    })),
    customData: `<atom:link href="${site.url}/rss.xml" rel="self" type="application/rss+xml"/><language>en-us</language>`,
  });
}
