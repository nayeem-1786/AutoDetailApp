// ---------------------------------------------------------------------------
// CSS Style Context for AI Page Content Generation
// Provides theme-aware class reference for Claude to use when generating HTML
// ---------------------------------------------------------------------------

export function getPageStyleContext(): string {
  return `
## Available CSS Classes (Theme-Aware)

### Text Colors
- text-site-text — primary body text (adapts to theme)
- text-gray-400 — secondary/muted text
- text-lime — accent color (brand lime green)

### Background Colors
- bg-brand-surface — card/section background
- bg-brand-dark — page background (darker)
- bg-lime — lime accent background (use sparingly)
- bg-lime/10 — subtle lime tint

### Borders
- border-site-border — standard border
- border-lime/20 — subtle lime border accent

### Links
- text-lime hover:underline — standard link style

### Layout
- max-w-none — full width within container
- space-y-6 — vertical spacing between sections
- grid grid-cols-1 md:grid-cols-2 gap-6 — two-column grid
- grid grid-cols-1 md:grid-cols-3 gap-6 — three-column grid

### Cards
- bg-brand-surface rounded-lg p-6 border border-site-border — standard card
- bg-brand-surface/50 rounded-lg p-4 — lighter card

### Typography
- text-2xl font-semibold mb-3 — h2 heading
- text-xl font-semibold mb-2 — h3 heading
- text-lg font-medium — subtitle
- text-sm — small text

### Lists
- list-disc pl-6 space-y-1 — unordered list
- list-decimal pl-6 space-y-1 — ordered list

### Images
- rounded-lg my-6 — standard image
- rounded-lg shadow-lg — image with shadow

### Decorative
- border-site-border my-8 — horizontal rule
- rounded-lg my-6 — divider with rounding

## Rules
- Output ONLY HTML body content (no html/head/body/style tags)
- Start headings at h2 (h1 is the page title rendered by the layout)
- Use the theme-aware classes listed above; NEVER use hardcoded colors like text-white or bg-gray-900
- Use proper heading hierarchy (h2 → h3 → h4)
- Keep paragraphs in <p> tags
- Use semantic HTML: <strong>, <em>, <ul>, <ol>, <blockquote>
- For CTAs, use: <a href="#" class="inline-block bg-lime text-black font-semibold px-6 py-3 rounded-lg hover:bg-lime/90 transition-colors">CTA Text</a>
`.trim();
}
