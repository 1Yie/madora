use std::path::Path;

fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let dotenv_path = Path::new(&manifest_dir)
        .parent()
        .unwrap()
        .join(".env");

    // Read .env file for local development
    if let Ok(contents) = std::fs::read_to_string(&dotenv_path) {
        for line in contents.lines() {
            if let Some((key, val)) = line.split_once('=') {
                let key = key.trim();
                if key.starts_with('#') || key.is_empty() {
                    continue;
                }
                // Don't override if already set in environment (CI provides real values)
                if std::env::var(key).is_err() {
                    println!("cargo:rustc-env={key}={}", val.trim());
                }
            }
        }
    }

    // Propagate AUTH_SERVER_URL from environment (CI sets this at build time)
    if let Ok(val) = std::env::var("AUTH_SERVER_URL") {
        println!("cargo:rustc-env=AUTH_SERVER_URL={val}");
    }

    tauri_build::build()
}
