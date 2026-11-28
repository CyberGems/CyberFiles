use std::sync::atomic::{AtomicBool, Ordering};
use tauri_plugin_opener::OpenerExt;

static IN_PROGRESS: AtomicBool = AtomicBool::new(false);
struct StarAttempt;
impl Drop for StarAttempt {
    fn drop(&mut self) { IN_PROGRESS.store(false, Ordering::Release); }
}

#[tauri::command]
pub async fn star_repository(app: tauri::AppHandle) -> Result<String, String> {
    if IN_PROGRESS.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_err() {
        return Err("GitHub star already in progress".into());
    }
    let attempt = StarAttempt;
    tauri::async_runtime::spawn_blocking(move || {
        let _attempt = attempt;
        if super::github_star_cli::try_star("CyberGems/CyberFiles")? {
            return Ok("starred".into());
        }
        app.opener().open_url("https://github.com/CyberGems/CyberFiles", None::<&str>)
            .map_err(|error| error.to_string())?;
        Ok("opened".into())
    }).await.map_err(|error| error.to_string())?
}
