Task
Fill the gap in this Markdown document.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Quality checks

- connect directly from the prefix into the suffix
- keep formatting and whitespace consistent with the local block
- if the suffix is empty, stop at a natural local boundary

Return only the missing text for the cursor gap.
