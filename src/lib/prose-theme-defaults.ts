export const PROSE_THEME_DEFAULTS = `
.prose-custom {
  line-height: 1.8;
  word-wrap: break-word;
}

.prose-custom > *:first-child {
  margin-top: 0 !important;
}

.prose-custom h1 {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.25;
  margin-top: 2.5rem;
  margin-bottom: 1.25rem;
  letter-spacing: -0.02em;
}

.prose-custom h2 {
  font-size: 1.625rem;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 2rem;
  margin-bottom: 1rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--border);
}

.prose-custom h3 {
  font-size: 1.375rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.75rem;
  margin-bottom: 0.75rem;
}

.prose-custom h4,
.prose-custom h5,
.prose-custom h6 {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.5;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

.prose-custom p {
  margin-top: 1rem;
  margin-bottom: 1rem;
}

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
}

.prose-custom ul ul ul {
  list-style-type: square;
}

.prose-custom li {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.prose-custom li > ul,
.prose-custom li > ol {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.prose-custom blockquote {
  border-left: 4px solid var(--border);
  padding: 0.5rem 0 0.5rem 1.25rem;
  margin: 1.5rem 0;
  color: var(--muted-foreground);
  font-style: italic;
  opacity: 0.9;
}

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

.prose-custom a {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 3px;
  font-weight: 500;
  transition: opacity 0.2s ease;
}

.prose-custom a:hover {
  opacity: 0.7;
}

.prose-custom hr {
  margin: 2.5rem 0;
  border: 0;
  border-top: 2px solid var(--border);
  width: 100%;
  opacity: 0.5;
}

.prose-custom table {
  width: 100%;
  margin: 1.5rem 0;
  border-collapse: separate;
  border-spacing: 0;
}

.prose-custom th,
.prose-custom td {
  border: 1px solid var(--border);
  padding: 0.75rem 1rem;
  text-align: left;
}

.prose-custom th {
  background-color: var(--muted);
  font-weight: 700;
  font-size: 0.95rem;
}

.prose-custom img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-lg);
  margin: 2rem auto;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.prose-custom input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  margin-right: 0.5rem;
  vertical-align: middle;
}
`;
