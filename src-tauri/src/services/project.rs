use std::fs;
use std::path::Path;

use ignore::WalkBuilder;

pub fn read_file_content(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

pub fn scan_project(root: &Path) -> Result<Vec<String>, String> {
    let mut files = Vec::new();

    for entry in WalkBuilder::new(root).build() {
        match entry {
            Ok(entry) => {
                if entry
                    .file_type()
                    .map(|file_type| file_type.is_file())
                    .unwrap_or(false)
                {
                    files.push(entry.path().display().to_string());
                }
            }
            Err(error) => return Err(error.to_string()),
        }
    }

    Ok(files)
}
