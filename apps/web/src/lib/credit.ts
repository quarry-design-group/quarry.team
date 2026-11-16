/**
 * creditHtml — render a hero image's photo credit (frontmatter `heroCredit`)
 * with its markdown links as anchors. The input is trusted, first-party
 * content; links open in a new tab and pass no ranking signal.
 */
export const creditHtml = (md: string): string =>
  md.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, text: string, url: string) =>
      `<a href="${url}" target="_blank" rel="nofollow noopener">${text}</a>`,
  );
