Task
Complete the missing Markdown span.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Checks

- match the local tone and block structure
- bridge into the suffix without repeating it
- if the suffix is empty, end at a natural local boundary

Return only the missing text for the gap.
