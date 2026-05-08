mod app;
mod commands;
mod models;
mod prompt;
mod providers;
mod services;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app::run();
}
