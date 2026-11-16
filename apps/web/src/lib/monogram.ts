/**
 * monogram — the two-letter mark shown where a person or client has no image:
 * case-card client chips, testimonial avatars, and the team roster.
 *
 * Takes the initials of the first two words, punctuation stripped and
 * uppercased ("Harvest Hosts" → "HH"). With `preferCapitals`, a name that
 * already carries two or more capitals keeps its own ("VP of Engineering" →
 * "VP").
 */
export function monogram(name: string, { preferCapitals = false } = {}): string {
  if (preferCapitals) {
    const caps = name.match(/\p{Lu}/gu) ?? [];
    if (caps.length >= 2) return caps.slice(0, 2).join('');
  }
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
