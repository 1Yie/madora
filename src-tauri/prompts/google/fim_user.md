Task
Fill the cursor gap in this Markdown document.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Checks

- connect smoothly into the exact trailing text
- keep local formatting unchanged unless the gap requires it
- if the trailing text is empty, stop at a sensible local boundary

Return only the missing text for the cursor gap.
