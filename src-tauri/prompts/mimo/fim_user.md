Task
Complete the missing Markdown span.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Checks

- match the local language mix and formatting
- bridge into the suffix without repeating it
- if the suffix is empty, stop at a natural local boundary

Return only the missing text for the gap.
