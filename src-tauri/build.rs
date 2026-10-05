use std::path::Path;

fn ensure_cli_placeholder(manifest_dir: &str, file_name: &str) {
    let cli_path = Path::new(manifest_dir)
        .join("target")
        .join("release")
        .join(file_name);
    if !cli_path.exists() {
        if let Some(parent) = cli_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&cli_path, b"");
    }
}

fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();

    // Ensure both platform resource placeholders exist so Tauri dev/check keeps
    // working before the real CLI is built for the current target.
    ensure_cli_placeholder(&manifest_dir, "mado");
    ensure_cli_placeholder(&manifest_dir, "mado.exe");

    tauri_build::build()
}
