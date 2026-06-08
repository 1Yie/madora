pub mod app;
pub mod commands;
pub mod models;
pub mod prompt;
pub mod providers;
pub mod services;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app::run();
}
