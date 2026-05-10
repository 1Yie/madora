export const PROSE_THEME_DEFAULTS = `
.prose-custom {
  line-height: 1.8;
  word-wrap: break-word;
  color: var(--foreground);
}

.prose-custom > *:first-child {
  margin-top: 0 !important;
}

/* ── Headings ── */

.prose-custom h1,
.prose-custom h2,
.prose-custom h3,
.prose-custom h4,
.prose-custom h5,
.prose-custom h6 {
  font-weight: 700;
  line-height: 1.3;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--border);
  color: var(--foreground);
  letter-spacing: -0.01em;
}

.prose-custom h1 {
  font-size: 2rem;
  font-weight: 800;
  margin-top: 0;
  margin-bottom: 1.25rem;
  letter-spacing: -0.02em;
}

.prose-custom h2 {
  font-size: 1.625rem;
  margin-top: 2.5rem;
  margin-bottom: 1rem;
}

.prose-custom h3 {
  font-size: 1.375rem;
  margin-top: 2rem;
}

.prose-custom h4 {
  font-size: 1.2rem;
  margin-top: 1.75rem;
}

.prose-custom h5 {
  font-size: 1.05rem;
  margin-top: 1.5rem;
}

.prose-custom h6 {
  font-size: 0.95rem;
  font-weight: 600;
  margin-top: 1.5rem;
}

/* Anchor links inside headings */
.prose-custom h1 a,
.prose-custom h2 a,
.prose-custom h3 a,
.prose-custom h4 a,
.prose-custom h5 a,
.prose-custom h6 a {
  color: inherit;
  text-decoration: none;
  font-weight: inherit;
}

/* ── Paragraph ── */

.prose-custom p {
  margin-top: 1rem;
  margin-bottom: 1rem;
}

/* ── Lists ── */

.prose-custom ul {
  list-style-type: disc;
  margin-top: 1rem;
  margin-bottom: 1rem;
  padding-left: 1.75rem;
}

.prose-custom ol {
  list-style-type: decimal;
  margin-top: 1rem;
  margin-bottom: 1rem;
  padding-left: 1.75rem;
}

.prose-custom ul ul {
  list-style-type: circle;
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.prose-custom ul ul ul {
  list-style-type: square;
}

.prose-custom ol ol {
  list-style-type: lower-alpha;
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.prose-custom ol ol ol {
  list-style-type: lower-roman;
}

.prose-custom li {
  margin-top: 0.4rem;
  margin-bottom: 0.4rem;
  padding-left: 0.25rem;
}

.prose-custom li > ul,
.prose-custom li > ol {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.prose-custom li > p {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

/* ── Task list ── */

.prose-custom ul:has(> li > input[type="checkbox"]) {
  list-style: none;
  padding-left: 0.25rem;
}

.prose-custom li:has(> input[type="checkbox"]) {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding-left: 0;
}

.prose-custom input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  margin-top: 0.3rem;
  flex-shrink: 0;
  accent-color: var(--primary);
  cursor: default;
}

/* ── Blockquote ── */

.prose-custom blockquote {
  border-left: 3px solid color-mix(in oklab, var(--primary) 50%, var(--border));
  padding: 0.6rem 1rem 0.6rem 1.25rem;
  margin: 1.5rem 0;
  color: var(--muted-foreground);
  font-style: italic;
  background-color: color-mix(in oklab, var(--muted) 50%, transparent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.prose-custom blockquote p {
  margin: 0;
}

.prose-custom blockquote > *:first-child {
  margin-top: 0 !important;
}

.prose-custom blockquote > *:last-child {
  margin-bottom: 0 !important;
}

/* Nested blockquote */
.prose-custom blockquote blockquote {
  margin: 0.75rem 0;
  opacity: 0.85;
}

/* ── Code: inline ── */

.prose-custom :not(pre) > code {
  font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Monaco, Consolas, monospace;
  font-size: 0.875em;
  background-color: color-mix(in oklab, var(--muted) 80%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.15em 0.4em;
  letter-spacing: -0.01em;
  color: var(--foreground);
  white-space: nowrap;
}

/* ── Code: block ── */

.prose-custom :not(pre) > code {
  font-family:
    "JetBrains Mono", ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Monaco, Consolas,
    monospace;
  font-size: 0.9em;
  background-color: var(--muted);
  border-radius: 0.375rem;
  padding: 0.2rem 0.4rem;
  letter-spacing: -0.01em;
}

/* ── Links ── */

.prose-custom a {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: color-mix(in oklab, var(--primary) 40%, transparent);
  font-weight: 500;
  transition: opacity 0.15s ease;
}

.prose-custom a:hover {
  opacity: 0.75;
}

.prose-custom a:visited {
  color: color-mix(in oklab, var(--primary) 80%, var(--muted-foreground));
}

/* ── Inline formatting ── */

.prose-custom strong,
.prose-custom b {
  font-weight: 700;
  color: var(--foreground);
}

.prose-custom em,
.prose-custom i {
  font-style: italic;
  color: color-mix(in oklab, var(--foreground) 85%, var(--muted-foreground));
}

.prose-custom s,
.prose-custom del,
.prose-custom strike {
  text-decoration: line-through;
  color: var(--muted-foreground);
  opacity: 0.8;
}

.prose-custom u,
.prose-custom ins {
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: color-mix(in oklab, var(--foreground) 50%, transparent);
}

.prose-custom mark {
  background-color: color-mix(in oklab, var(--warning) 30%, transparent);
  color: var(--foreground);
  border-radius: 2px;
  padding: 0.05em 0.25em;
}

.prose-custom strong em,
.prose-custom em strong {
  font-weight: 700;
  font-style: italic;
}

/* ── HR ── */

.prose-custom hr {
  margin: 2.5rem 0;
  border: 0;
  border-top: 1px solid var(--border);
  opacity: 0.6;
}

/* ── Table ── */

.prose-custom table {
  width: 100%;
  margin: 1.5rem 0;
  border-collapse: collapse;
  font-size: 0.925rem;
  overflow: hidden;
  display: block;
  overflow-x: auto;
}

.prose-custom thead {
  background-color: var(--muted);
}

.prose-custom th {
  border: 1px solid var(--border);
  padding: 0.6rem 1rem;
  text-align: left;
  vertical-align: middle;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--foreground);
  white-space: nowrap;
}

.prose-custom td {
  border: 1px solid var(--border);
  padding: 0.6rem 1rem;
  text-align: left;
  vertical-align: top;
}

.prose-custom tbody tr:nth-child(even) td {
  background-color: color-mix(in oklab, var(--muted) 30%, transparent);
}

.prose-custom tbody tr:hover td {
  background-color: color-mix(in oklab, var(--muted) 55%, transparent);
  transition: background-color 0.1s ease;
}

/* Alignment from GFM */
.prose-custom th[align="center"],
.prose-custom td[align="center"] {
  text-align: center;
}

.prose-custom th[align="right"],
.prose-custom td[align="right"] {
  text-align: right;
}

/* ── Image ── */

.prose-custom img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-lg);
  margin: 2rem auto;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--border);
}

.prose-custom figure {
  margin: 2rem 0;
  text-align: center;
}

.prose-custom figure img {
  margin: 0 auto 0.75rem;
}

.prose-custom figcaption {
  font-size: 0.875rem;
  color: var(--muted-foreground);
  font-style: italic;
}

/* ── Kbd ── */

.prose-custom kbd {
  font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8em;
  background-color: var(--muted);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: var(--radius-sm);
  padding: 0.15em 0.45em;
  color: var(--foreground);
  white-space: nowrap;
}

/* ── Superscript / Subscript ── */

.prose-custom sup {
  font-size: 0.75em;
  vertical-align: super;
  line-height: 0;
}

.prose-custom sub {
  font-size: 0.75em;
  vertical-align: sub;
  line-height: 0;
}

/* ── Abbreviation ── */

.prose-custom abbr[title] {
  text-decoration: underline dotted;
  text-underline-offset: 2px;
  cursor: help;
  color: inherit;
}

/* ── Details / Summary ── */

.prose-custom details {
  margin: 1.25rem 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.75rem 1rem;
  background-color: color-mix(in oklab, var(--muted) 30%, transparent);
}

.prose-custom summary {
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  color: var(--foreground);
  list-style: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.prose-custom summary::before {
  content: "▶";
  font-size: 0.7em;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.prose-custom details[open] > summary::before {
  transform: rotate(90deg);
}

.prose-custom details > *:not(summary):first-of-type {
  margin-top: 0.75rem;
}

/* ── Footnotes ── */

.prose-custom .footnotes {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  font-size: 0.875rem;
  color: var(--muted-foreground);
}

.prose-custom .footnotes ol {
  padding-left: 1.25rem;
}

.prose-custom .footnotes li {
  margin-top: 0.35rem;
  margin-bottom: 0.35rem;
}

.prose-custom a[data-footnote-backref] {
  font-size: 0.8em;
  text-decoration: none;
  opacity: 0.7;
}

.prose-custom a[data-footnote-backref]:hover {
  opacity: 1;
}

/* ── Definition list ── */

.prose-custom dl {
  margin: 1rem 0;
}

.prose-custom dt {
  font-weight: 600;
  color: var(--foreground);
  margin-top: 0.75rem;
}

.prose-custom dd {
  margin-left: 1.5rem;
  color: var(--muted-foreground);
  margin-top: 0.25rem;
}

/* ── Video / Audio / Iframe embeds ── */

.prose-custom video,
.prose-custom audio {
  display: block;
  max-width: 100%;
  margin: 1.5rem auto;
  border-radius: var(--radius-md);
}

.prose-custom iframe {
  display: block;
  max-width: 100%;
  margin: 1.5rem auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

/* ── Divs / Sections (raw HTML in md) ── */

.prose-custom div,
.prose-custom section,
.prose-custom article {
  max-width: 100%;
}

/* ── Print ── */

@media print {
  .prose-custom {
    color: #000;
    background: #fff;
  }

  .prose-custom a {
    color: #000;
    text-decoration: underline;
  }

  .prose-custom pre,
  .prose-custom blockquote {
    border: 1px solid #ccc;
    page-break-inside: avoid;
  }

  .prose-custom img {
    max-width: 100% !important;
    page-break-inside: avoid;
  }

  .prose-custom h1,
  .prose-custom h2,
  .prose-custom h3 {
    page-break-after: avoid;
  }
}

/* ── KaTeX (math formulas) ── */

.prose-custom .katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.5rem 0;
  margin: 1.5rem 0;
}

.prose-custom .katex {
  font-size: 1.1em;
}
`;
