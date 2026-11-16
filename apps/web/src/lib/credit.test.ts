import { describe, it, expect } from 'vitest';
import { creditHtml } from './credit';

describe('creditHtml', () => {
  it('turns markdown links into external anchors', () => {
    expect(creditHtml('Photo by [Ann Lee](https://unsplash.com/@ann) on Unsplash')).toBe(
      'Photo by <a href="https://unsplash.com/@ann" target="_blank" rel="nofollow noopener">Ann Lee</a> on Unsplash',
    );
  });
  it('converts every link in the credit', () => {
    const html = creditHtml('[A](https://a.example) and [B](https://b.example)');
    expect(html.match(/<a /g)).toHaveLength(2);
  });
  it('leaves plain text untouched', () => {
    expect(creditHtml('Photo courtesy of the client')).toBe('Photo courtesy of the client');
  });
});
