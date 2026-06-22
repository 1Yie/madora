Task
Complete the missing Markdown span.

Title: {{title}}

Text before the cursor:
{{prefix}}

Text after the cursor:
{{suffix}}

Checks

- bridge cleanly into the suffix without repeating it
- stay in the current block type and writing mode
- if the suffix is empty, finish only the local thought or structure

Return only the missing text for the gap.
