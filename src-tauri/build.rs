use std::{env, path::{Path, PathBuf}};

fn load_build_env(root: &Path, profile: &str) {
    println!("cargo:rerun-if-env-changed=AUTH_SERVER_URL");

    let mode = if profile == "release" {
        "production"
    } else {
        "development"
    };

    let candidates = [
        root.join(format!(".env.{mode}.local")),
        root.join(format!(".env.{mode}")),
        root.join(".env.local"),
        root.join(".env"),
    ];

    for path in &candidates {
        println!("cargo:rerun-if-changed={}", path.display());
    }

    if env::var_os("AUTH_SERVER_URL").is_none() {
        for path in &candidates {
            if path.is_file() {
                let _ = dotenv::from_path(path);
            }
        }
    }

    if let Ok(auth_server_url) = env::var("AUTH_SERVER_URL") {
        println!("cargo:rustc-env=AUTH_SERVER_URL={auth_server_url}");
    }
}

fn workspace_root() -> PathBuf {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    manifest_dir
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or(manifest_dir)
}

fn main() {
    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    load_build_env(&workspace_root(), &profile);
    tauri_build::build()
}
