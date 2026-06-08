use similar::{ChangeTag, TextDiff};

#[derive(Clone, Debug)]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub content: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum DiffLineKind {
    Equal,
    Insert,
    Delete,
}

pub struct FileDiff {
    pub lines: Vec<DiffLine>,
}

/// Split file content at a 1-based line:col into prefix and suffix.
pub fn split_at_cursor(content: &str, line: usize, col: usize) -> (String, String) {
    let lines: Vec<&str> = content.split('\n').collect();
    let total_lines = lines.len();

    // 1-based to 0-based
    let cursor_line = if line > 0 { line - 1 } else { 0 };
    let cursor_col = if col > 0 { col - 1 } else { 0 };

    let mut prefix = String::new();
    let mut suffix_string = String::new();

    for (i, l) in lines.iter().enumerate() {
        if i < cursor_line {
            // Full line before cursor line → prefix
            if !prefix.is_empty() {
                prefix.push('\n');
            }
            prefix.push_str(l);
        } else if i == cursor_line {
            // Cursor line: split at column
            let byte_pos = char_idx_to_byte(l, cursor_col);
            if !prefix.is_empty() {
                prefix.push('\n');
            }
            prefix.push_str(&l[..byte_pos]);

            // Rest of cursor line → suffix
            let rest = &l[byte_pos..];
            if !rest.is_empty() {
                suffix_string.push_str(rest);
            }

            // Add remaining lines (always separated by newline)
            for j in (i + 1)..total_lines {
                suffix_string.push('\n');
                suffix_string.push_str(lines[j]);
            }
        }
    }

    // Edge case: cursor past the last line (append mode).
    // The loop never hits the cursor_line branch, so suffix stays empty
    // and everything becomes prefix.
    if cursor_line >= total_lines {
        prefix = content.to_string();
    }

    (prefix, suffix_string)
}

/// Return the byte offset after `char_count` characters (0-based count).
/// For char_count=0, returns 0 (empty prefix).
/// For char_count >= s.chars().count(), returns s.len() (full string).
fn char_idx_to_byte(s: &str, char_count: usize) -> usize {
    if char_count == 0 {
        return 0;
    }
    // We want the byte *after* the (char_count-1)-th character (0-based)
    let last_included = char_count - 1;
    match s.char_indices().nth(last_included) {
        Some((byte_start, c)) => byte_start + c.len_utf8(),
        None => s.len(),
    }
}

/// Compute a line-based diff between original and completed content.
pub fn compute_diff(original: &str, completed: &str) -> FileDiff {
    let diff = TextDiff::from_lines(original, completed);
    let mut lines: Vec<DiffLine> = Vec::new();

    for change in diff.iter_all_changes() {
        let content = change.value().to_string();
        match change.tag() {
            ChangeTag::Equal => {
                lines.push(DiffLine {
                    kind: DiffLineKind::Equal,
                    content,
                });
            }
            ChangeTag::Insert => {
                lines.push(DiffLine {
                    kind: DiffLineKind::Insert,
                    content,
                });
            }
            ChangeTag::Delete => {
                lines.push(DiffLine {
                    kind: DiffLineKind::Delete,
                    content,
                });
            }
        }
    }

    FileDiff { lines }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_at_cursor_basic() {
        let content = "line1\nline2\nline3";
        let (prefix, suffix) = split_at_cursor(content, 2, 3); // "line2" at col 3 = "li"
        assert_eq!(prefix, "line1\nli");
        assert_eq!(suffix, "ne2\nline3");
    }

    #[test]
    fn split_at_cursor_first_line() {
        let content = "hello world\nsecond line";
        let (prefix, suffix) = split_at_cursor(content, 1, 6);
        // col=6 means cursor AT the 6th character (space). Prefix includes 5 chars.
        assert_eq!(prefix, "hello");
        assert_eq!(suffix, " world\nsecond line");
    }

    #[test]
    fn split_at_cursor_end_of_line() {
        let content = "line1\nline2\nline3";
        // "line2" is 5 chars. col=6 is beyond the line — cursor at end of line.
        let (prefix, suffix) = split_at_cursor(content, 2, 6);
        assert_eq!(prefix, "line1\nline2");
        assert_eq!(suffix, "\nline3");
    }

    #[test]
    fn split_at_cursor_empty_file() {
        let (prefix, suffix) = split_at_cursor("", 1, 1);
        assert_eq!(prefix, "");
        assert_eq!(suffix, "");
    }

    #[test]
    fn split_at_cursor_single_line() {
        let content = "hello";
        let (prefix, suffix) = split_at_cursor(content, 1, 3);
        assert_eq!(prefix, "he");
        assert_eq!(suffix, "llo");
    }

    #[test]
    fn compute_diff_simple_insert() {
        let original = "line1\nline2\nline3";
        let completed = "line1\nline2\ninserted\nline3";
        let result = compute_diff(original, completed);

        let inserts: Vec<_> = result
            .lines
            .iter()
            .filter(|l| l.kind == DiffLineKind::Insert)
            .collect();
        assert_eq!(inserts.len(), 1);
        assert_eq!(inserts[0].content.trim(), "inserted");
    }

    #[test]
    fn compute_diff_no_changes() {
        let content = "hello\nworld";
        let result = compute_diff(content, content);
        assert!(result.lines.iter().all(|l| l.kind == DiffLineKind::Equal));
    }

    #[test]
    fn compute_diff_replacement() {
        let original = "line1\nold\nline3";
        let completed = "line1\nnew\nline3";
        let result = compute_diff(original, completed);

        let deletes: Vec<_> = result
            .lines
            .iter()
            .filter(|l| l.kind == DiffLineKind::Delete)
            .collect();
        let inserts: Vec<_> = result
            .lines
            .iter()
            .filter(|l| l.kind == DiffLineKind::Insert)
            .collect();

        assert!(!deletes.is_empty());
        assert!(!inserts.is_empty());
    }
}
