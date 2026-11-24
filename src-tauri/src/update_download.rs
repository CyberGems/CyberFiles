use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{ipc::Channel, Manager, Resource, ResourceId, State, Webview};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::Update;

type AbortDownload = Box<dyn Fn() + Send>;

#[derive(Default)]
pub struct UpdateDownload(Mutex<Option<AbortDownload>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

enum VerifiedPackage {
    Installer { update: Box<Update>, bytes: Vec<u8> },
    Portable(PathBuf),
}

impl Resource for VerifiedPackage {}

#[tauri::command]
pub async fn download_update_package(
    webview: Webview,
    state: State<'_, UpdateDownload>,
    update_rid: ResourceId,
    progress: Channel<Progress>,
) -> Result<Option<ResourceId>, String> {
    let mut update = (*webview
        .resources_table()
        .get::<Update>(update_rid)
        .map_err(|error| error.to_string())?)
    .clone();
    update.timeout = Some(Duration::from_secs(300));

    let portable_dir = if super::is_portable_build() {
        Some(
            webview
                .path()
                .download_dir()
                .map_err(|error| error.to_string())?
                .join("CyberFiles"),
        )
    } else {
        None
    };
    let task = {
        let mut active = state.0.lock().map_err(|error| error.to_string())?;
        if active.is_some() {
            return Err("An update download is already active".into());
        }
        let started = progress.clone();
        let task = tauri::async_runtime::spawn(async move {
            if let Some(directory) = portable_dir {
                return download_portable(&update.version, &directory, &progress).await;
            }
            let mut downloaded = 0;
            let bytes = update
                .download(
                    |chunk, total| {
                        downloaded += chunk as u64;
                        let _ = progress.send(Progress { downloaded, total });
                    },
                    || {},
                )
                .await
                .map_err(|error| error.to_string())?;
            Ok(VerifiedPackage::Installer {
                update: Box::new(update),
                bytes,
            })
        });
        let abort = task.inner().abort_handle();
        *active = Some(Box::new(move || abort.abort()));
        let _ = started.send(Progress {
            downloaded: 0,
            total: None,
        });
        task
    };

    let result = task.await;
    *state.0.lock().map_err(|error| error.to_string())? = None;
    match result {
        Ok(Ok(package)) => Ok(Some(webview.resources_table().add(package))),
        Ok(Err(error)) => Err(error.to_string()),
        Err(error) if matches!(&error, tauri::Error::JoinError(inner) if inner.is_cancelled()) => {
            Ok(None)
        }
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn cancel_update_download(state: State<'_, UpdateDownload>) -> Result<(), String> {
    if let Some(abort) = state.0.lock().map_err(|error| error.to_string())?.as_ref() {
        abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn apply_update_package(webview: Webview, package_rid: ResourceId) -> Result<(), String> {
    let package = webview
        .resources_table()
        .get::<VerifiedPackage>(package_rid)
        .map_err(|error| error.to_string())?;
    match package.as_ref() {
        VerifiedPackage::Installer { update, bytes } => {
            update
                .as_ref()
                .clone()
                .restart_after_install(true)
                .install(bytes)
                .map_err(|error| error.to_string())?;
            let _ = webview.resources_table().close(package_rid);
            Ok(())
        }
        VerifiedPackage::Portable(path) => webview
            .opener()
            .reveal_item_in_dir(path)
            .map_err(|error| error.to_string()),
    }
}

struct PartialArchive(PathBuf);

impl Drop for PartialArchive {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

async fn download_portable(
    version: &str,
    directory: &Path,
    progress: &Channel<Progress>,
) -> Result<VerifiedPackage, String> {
    if version.is_empty()
        || !version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b".-+".contains(&byte))
    {
        return Err("Invalid portable update version".into());
    }

    let base = format!("https://github.com/CyberGems/CyberFiles/releases/download/v{version}");
    let filename = format!("CyberFiles_{version}_x64-portable.zip");
    let client = reqwest::Client::builder()
        .https_only(true)
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|error| error.to_string())?;
    let checksums = client
        .get(format!("{base}/SHA256SUMS.txt"))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    let expected = archive_checksum(&checksums, &filename)
        .ok_or("The release does not publish the portable archive checksum")?;

    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let destination = directory.join(&filename);
    let partial_path = directory.join(format!(".{filename}.{}.download", std::process::id()));
    // Only this process and a single active download can own its staging file.
    let partial;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&partial_path)
        .map_err(|error| error.to_string())?;
    // The file must be closed before the guard removes it on Windows.
    partial = PartialArchive(partial_path);
    let mut response = client
        .get(format!("{base}/{filename}"))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|error| error.to_string())?;
    let total = response.content_length();
    let mut hash = Sha256::new();
    let mut downloaded = 0;
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        file.write_all(&chunk).map_err(|error| error.to_string())?;
        hash.update(&chunk);
        downloaded += chunk.len() as u64;
        let _ = progress.send(Progress { downloaded, total });
    }
    file.flush().map_err(|error| error.to_string())?;
    drop(file);
    if !format!("{:x}", hash.finalize()).eq_ignore_ascii_case(expected) {
        return Err("The portable archive checksum does not match".into());
    }
    fs::rename(&partial.0, &destination).map_err(|error| error.to_string())?;
    Ok(VerifiedPackage::Portable(destination))
}

fn archive_checksum<'a>(manifest: &'a str, filename: &str) -> Option<&'a str> {
    manifest.lines().find_map(|line| {
        let (hash, path) = line.split_once(char::is_whitespace)?;
        (path.trim_start_matches([' ', '\t', '*']) == filename
            && hash.len() == 64
            && hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .then_some(hash)
    })
}

#[cfg(test)]
mod tests {
    use super::archive_checksum;

    #[test]
    fn uses_only_the_checksum_for_the_portable_archive() {
        let hash = "a".repeat(64);
        let archive = "CyberFiles_1.2.3_x64-portable.zip";
        let manifest = format!(
            "{}  CyberFiles_1.2.3_x64-setup.exe\r\n{hash}  {archive}\r\n",
            "b".repeat(64)
        );
        assert_eq!(archive_checksum(&manifest, archive), Some(hash.as_str()));
        assert_eq!(archive_checksum(&manifest, "another.zip"), None);
        assert_eq!(
            archive_checksum(&format!("invalid  {archive}"), archive),
            None
        );
    }
}
