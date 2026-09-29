use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::{self, Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Condvar, Mutex, OnceLock},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, PhysicalSize,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

// UnRAR source code may be used in any software to handle RAR archives without limitations free of charge, but cannot be used to develop RAR (WinRAR) compatible archiver and to re-create RAR compression algorithm, which is proprietary. Distribution of modified UnRAR source code in separate form or as a part of other software is permitted, provided that full text of this paragraph, starting from "UnRAR source code" words, is included in license, or in documentation if license is not available, and in source code comments of resulting package.
use unrar_rs::{sanitize_path as sanitize_rar_path, RarArchive};
use zip::{
    read::ZipArchive,
    write::{SimpleFileOptions, ZipWriter},
    CompressionMethod,
};

mod windows_file_icons;

#[derive(Serialize)]
struct RuntimeInfo {
    app_name: &'static str,
    version: &'static str,
    platform: &'static str,
    mode: &'static str,
}

struct TrayMenuState {
    toggle: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
    english: Mutex<bool>,
    shortcut_hint: Mutex<Option<String>>,
    tray: Mutex<Option<TrayIcon<tauri::Wry>>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct GlobalShortcutPreferences {
    enabled: bool,
    shortcut: String,
}

impl Default for GlobalShortcutPreferences {
    fn default() -> Self {
        Self {
            enabled: true,
            shortcut: "Alt+Shift+F".to_string(),
        }
    }
}

struct GlobalShortcutState {
    preferences: Mutex<GlobalShortcutPreferences>,
    registered: Mutex<Option<String>>,
    config_path: PathBuf,
}

const APP_IDENTIFIER: &str = "com.cybergems.cyberfiles";
const INSTANCE_PREFERENCES_FILE: &str = "cyberfiles-instance-preferences.json";

#[derive(Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct InstancePreferences {
    allow_multiple_instances: bool,
}

struct InstancePreferencesState {
    preferences: Mutex<InstancePreferences>,
    config_path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstancePreferencesStatus {
    allow_multiple_instances: bool,
    supported: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GlobalShortcutStatus {
    enabled: bool,
    shortcut: String,
    registered: bool,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        app_name: "CyberFiles",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        mode: "development",
    }
}

#[tauri::command]
fn show_main_window(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    let state_path = window_state_path(&app)?;
    let restore_maximized = fs::read(&state_path)
        .ok()
        .and_then(|encoded| serde_json::from_slice::<StoredWindowState>(&encoded).ok())
        .is_some_and(|state| state.maximized);
    window.show().map_err(|error| error.to_string())?;
    // Bounds assigned while the initially hidden native window is being
    // created can be ignored by Windows. Apply its normal, centered rectangle
    // once it is visible, before switching back to maximized mode.
    restore_window_state(&window, &state_path)?;
    if restore_maximized {
        window.maximize().map_err(|error| error.to_string())?;
    }
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn hide_main_window(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    if let Ok(path) = window_state_path(&app) {
        let _ = save_window_state(&window, &path);
    }
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn quit_app(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    if has_active_transfer_jobs() {
        return Err("File transfers are still running.".to_string());
    }
    if let Ok(path) = window_state_path(&app) {
        let _ = save_window_state(&window, &path);
    }
    app.exit(0);
    Ok(())
}

fn global_shortcut_config_path<R: tauri::Runtime, M: Manager<R>>(
    app: &M,
) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("cyberfiles-global-shortcut.json"))
        .map_err(|error| error.to_string())
}

fn load_global_shortcut_preferences(path: &Path) -> GlobalShortcutPreferences {
    let Ok(contents) = fs::read(path) else {
        return GlobalShortcutPreferences::default();
    };
    let Ok(preferences) = serde_json::from_slice::<GlobalShortcutPreferences>(&contents) else {
        return GlobalShortcutPreferences::default();
    };
    if preferences.shortcut.contains('+')
        && preferences
            .shortcut
            .parse::<tauri_plugin_global_shortcut::Shortcut>()
            .is_ok()
    {
        preferences
    } else {
        GlobalShortcutPreferences::default()
    }
}

fn save_global_shortcut_preferences(
    path: &Path,
    preferences: &GlobalShortcutPreferences,
) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Global shortcut config path has no parent directory")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let contents = serde_json::to_vec(preferences).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn global_shortcut_status(state: &GlobalShortcutState) -> Result<GlobalShortcutStatus, String> {
    let preferences = state
        .preferences
        .lock()
        .map_err(|error| error.to_string())?;
    let registered = state.registered.lock().map_err(|error| error.to_string())?;
    Ok(GlobalShortcutStatus {
        enabled: preferences.enabled,
        shortcut: preferences.shortcut.clone(),
        registered: registered.is_some(),
    })
}

#[tauri::command]
fn get_global_shortcut_settings(app: tauri::AppHandle) -> Result<GlobalShortcutStatus, String> {
    global_shortcut_status(&app.state::<GlobalShortcutState>())
}

fn instance_preferences_config_path<R: tauri::Runtime, M: Manager<R>>(
    app: &M,
) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(INSTANCE_PREFERENCES_FILE))
        .map_err(|error| error.to_string())
}

fn load_instance_preferences(path: &Path) -> InstancePreferences {
    fs::read(path)
        .ok()
        .and_then(|contents| serde_json::from_slice(&contents).ok())
        .unwrap_or_default()
}

fn save_instance_preferences(path: &Path, preferences: &InstancePreferences) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Instance preference path has no parent directory")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let contents = serde_json::to_vec(preferences).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn instance_preferences_status(preferences: &InstancePreferences) -> InstancePreferencesStatus {
    InstancePreferencesStatus {
        allow_multiple_instances: preferences.allow_multiple_instances,
        supported: cfg!(target_os = "windows"),
    }
}

#[tauri::command]
fn get_instance_preferences(app: tauri::AppHandle) -> Result<InstancePreferencesStatus, String> {
    let state = app.state::<InstancePreferencesState>();
    state
        .preferences
        .lock()
        .map(|preferences| instance_preferences_status(&preferences))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_instance_preferences(
    allow_multiple_instances: bool,
    app: tauri::AppHandle,
) -> Result<InstancePreferencesStatus, String> {
    let state = app.state::<InstancePreferencesState>();
    let next_preferences = InstancePreferences {
        allow_multiple_instances,
    };
    save_instance_preferences(&state.config_path, &next_preferences)?;
    let mut preferences = state
        .preferences
        .lock()
        .map_err(|error| error.to_string())?;
    *preferences = next_preferences.clone();
    Ok(instance_preferences_status(&next_preferences))
}

#[cfg(target_os = "windows")]
struct SingleInstanceGuard(windows_sys::Win32::Foundation::HANDLE);

#[cfg(target_os = "windows")]
impl Drop for SingleInstanceGuard {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(target_os = "windows")]
fn startup_instance_preferences_path() -> Result<PathBuf, String> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|directory| {
            directory
                .join(APP_IDENTIFIER)
                .join(INSTANCE_PREFERENCES_FILE)
        })
        .ok_or("The Windows roaming application-data directory is unavailable".to_string())
}

#[cfg(target_os = "windows")]
fn focus_existing_main_window() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };

    let title: Vec<u16> = "CyberFiles Dev".encode_utf16().chain(Some(0)).collect();
    let window = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };
    if !window.is_null() {
        unsafe {
            ShowWindow(window, SW_RESTORE);
            SetForegroundWindow(window);
        }
    }
}

#[cfg(target_os = "windows")]
fn acquire_single_instance_guard() -> Result<Option<SingleInstanceGuard>, String> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, GetLastError, SetLastError, ERROR_ALREADY_EXISTS},
        System::Threading::CreateMutexW,
    };

    let name: Vec<u16> = "Local"
        .encode_utf16()
        .chain(Some(92))
        .chain("com.cybergems.cyberfiles.single-instance".encode_utf16())
        .chain(Some(0))
        .collect();
    unsafe {
        SetLastError(0);
    }
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    let last_error = unsafe { GetLastError() };
    if handle.is_null() {
        return Err(format!(
            "Could not create the CyberFiles single-instance mutex (Windows error {last_error})."
        ));
    }
    if last_error == ERROR_ALREADY_EXISTS {
        unsafe {
            CloseHandle(handle);
        }
        focus_existing_main_window();
        Ok(None)
    } else {
        Ok(Some(SingleInstanceGuard(handle)))
    }
}

#[tauri::command]
fn set_global_shortcut_settings(
    enabled: bool,
    shortcut: String,
    app: tauri::AppHandle,
) -> Result<GlobalShortcutStatus, String> {
    if !shortcut.contains('+') {
        return Err("A global shortcut must include at least one modifier key".to_string());
    }
    shortcut
        .parse::<tauri_plugin_global_shortcut::Shortcut>()
        .map_err(|error| error.to_string())?;

    let state = app.state::<GlobalShortcutState>();
    let mut preferences = state
        .preferences
        .lock()
        .map_err(|error| error.to_string())?;
    let mut registered = state.registered.lock().map_err(|error| error.to_string())?;
    let previous_preferences = preferences.clone();
    let previous_registered = registered.clone();
    let next_preferences = GlobalShortcutPreferences {
        enabled,
        shortcut: shortcut.clone(),
    };
    let next_registered = enabled.then_some(shortcut.clone());
    let shortcut_manager = app.global_shortcut();
    let mut newly_registered = false;

    if enabled && previous_registered.as_deref() != Some(shortcut.as_str()) {
        shortcut_manager
            .register(shortcut.as_str())
            .map_err(|error| error.to_string())?;
        newly_registered = true;
    }

    if let Err(error) = save_global_shortcut_preferences(&state.config_path, &next_preferences) {
        if newly_registered {
            let _ = shortcut_manager.unregister(shortcut.as_str());
        }
        return Err(error);
    }

    if let Some(previous) = previous_registered.as_deref() {
        if Some(previous) != next_registered.as_deref() {
            if let Err(error) = shortcut_manager.unregister(previous) {
                let _ = save_global_shortcut_preferences(&state.config_path, &previous_preferences);
                if newly_registered {
                    let _ = shortcut_manager.unregister(shortcut.as_str());
                }
                return Err(error.to_string());
            }
        }
    }

    *preferences = next_preferences;
    *registered = next_registered;
    drop(registered);
    drop(preferences);

    update_tray_hotkey_hint(&app, enabled.then_some(shortcut.as_str()))?;

    global_shortcut_status(&state)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFolderEntry {
    name: String,
    path: String,
    is_folder: bool,
    is_hidden: bool,
    size: u64,
    modified_ms: Option<u64>,
    created_ms: Option<u64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeFileIconRequest {
    id: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFileIconGroup {
    item_ids: Vec<String>,
    data_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowsSpecialFolder {
    id: String,
    path: String,
    is_file: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryListing {
    root_path: String,
    root_name: String,
    entries: Vec<NativeFolderEntry>,
    has_more: bool,
    next_offset: usize,
}

const DIRECTORY_PAGE_SIZE: usize = 400;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NativeOperationFailure {
    path: String,
    error: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NativeOperationResult {
    completed_paths: Vec<String>,
    failures: Vec<NativeOperationFailure>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TransferOperationProgress {
    job_id: String,
    phase: String,
    current_item: String,
    bytes_copied: u64,
    total_bytes: u64,
    current_file_bytes: u64,
    current_file_total: u64,
    items_completed: usize,
    total_items: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TransferOperationFinished {
    job_id: String,
    result: NativeOperationResult,
}

#[derive(Default)]
struct TransferJobState {
    paused: bool,
    cancelled: bool,
}

struct TransferJobControl {
    state: Mutex<TransferJobState>,
    changed: Condvar,
}

static TRANSFER_JOBS: OnceLock<Mutex<HashMap<String, Arc<TransferJobControl>>>> = OnceLock::new();

fn transfer_jobs() -> &'static Mutex<HashMap<String, Arc<TransferJobControl>>> {
    TRANSFER_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn has_active_transfer_jobs() -> bool {
    transfer_jobs().lock().map(|jobs| !jobs.is_empty()).unwrap_or(true)
}

fn find_transfer_job(job_id: &str) -> Result<Option<Arc<TransferJobControl>>, String> {
    let jobs = transfer_jobs().lock().map_err(|_| "File transfer registry is unavailable.".to_string())?;
    Ok(jobs.get(job_id).cloned())
}

fn wait_for_transfer_job(control: &TransferJobControl) -> Result<(), String> {
    let mut state = control.state.lock().map_err(|_| "File transfer state is unavailable.".to_string())?;
    while state.paused && !state.cancelled {
        state = control.changed.wait(state).map_err(|_| "File transfer state is unavailable.".to_string())?;
    }
    if state.cancelled {
        Err("File transfer cancelled.".to_string())
    } else {
        Ok(())
    }
}

struct TransferProgressTracker {
    app: tauri::AppHandle,
    job_id: String,
    phase: String,
    current_item: String,
    bytes_copied: u64,
    total_bytes: u64,
    current_file_bytes: u64,
    current_file_total: u64,
    items_completed: usize,
    total_items: usize,
    last_emit: std::time::Instant,
}

impl TransferProgressTracker {
    fn emit(&mut self, force: bool) {
        if !force && self.last_emit.elapsed() < std::time::Duration::from_millis(180) {
            return;
        }
        self.last_emit = std::time::Instant::now();
        let _ = self.app.emit("transfer-operation-progress", TransferOperationProgress {
            job_id: self.job_id.clone(),
            phase: self.phase.clone(),
            current_item: self.current_item.clone(),
            bytes_copied: self.bytes_copied,
            total_bytes: self.total_bytes,
            current_file_bytes: self.current_file_bytes,
            current_file_total: self.current_file_total,
            items_completed: self.items_completed,
            total_items: self.total_items,
        });
    }
}

fn count_copy_tree(
    root: &Path,
    control: &TransferJobControl,
    tracker: &mut TransferProgressTracker,
) -> Result<(), String> {
    wait_for_transfer_job(control)?;
    let root_metadata = fs::symlink_metadata(root).map_err(|error| format!("Cannot inspect {}: {error}", display_path(root)))?;
    tracker.total_items += 1;
    if root_metadata.is_file() && !root_metadata.file_type().is_symlink() {
        tracker.total_bytes = tracker.total_bytes.saturating_add(root_metadata.len());
    }
    tracker.current_item = root.file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_else(|| display_path(root));
    tracker.emit(false);
    let mut pending = if root_metadata.is_dir() && !root_metadata.file_type().is_symlink() {
        vec![root.to_path_buf()]
    } else {
        Vec::new()
    };
    while let Some(directory) = pending.pop() {
        wait_for_transfer_job(control)?;
        let entries = fs::read_dir(&directory).map_err(|error| format!("Cannot read {}: {error}", display_path(&directory)))?;
        for entry in entries {
            wait_for_transfer_job(control)?;
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            tracker.current_item = entry.file_name().to_string_lossy().to_string();
            let metadata = fs::symlink_metadata(&path).map_err(|error| format!("Cannot inspect {}: {error}", display_path(&path)))?;
            tracker.total_items += 1;
            if metadata.file_type().is_symlink() {
                tracker.emit(false);
                continue;
            }
            if metadata.is_dir() {
                pending.push(path);
            } else if metadata.is_file() {
                tracker.total_bytes = tracker.total_bytes.saturating_add(metadata.len());
            }
            tracker.emit(false);
        }
    }
    tracker.emit(true);
    Ok(())
}

fn copy_path_with_progress(
    source: &Path,
    destination: &Path,
    control: &TransferJobControl,
    tracker: &mut TransferProgressTracker,
    buffer: &mut [u8],
) -> Result<(), String> {
    wait_for_transfer_job(control)?;
    let metadata = fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    tracker.current_item = source.file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_else(|| display_path(source));
    tracker.current_file_bytes = 0;
    tracker.current_file_total = 0;
    if metadata.file_type().is_symlink() {
        return Err("Symbolic links are not followed by file operations.".to_string());
    }
    if metadata.is_dir() {
        fs::create_dir(destination).map_err(|error| error.to_string())?;
        tracker.items_completed += 1;
        tracker.emit(false);
        for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
            wait_for_transfer_job(control)?;
            let entry = entry.map_err(|error| error.to_string())?;
            copy_path_with_progress(
                &entry.path(),
                &destination.join(entry.file_name()),
                control,
                tracker,
                buffer,
            )?;
        }
        Ok(())
    } else if metadata.is_file() {
        tracker.current_file_bytes = 0;
        tracker.current_file_total = metadata.len();
        tracker.emit(false);
        let mut input = fs::File::open(source).map_err(|error| error.to_string())?;
        let mut output = fs::OpenOptions::new().write(true).create_new(true).open(destination).map_err(|error| error.to_string())?;
        loop {
            wait_for_transfer_job(control)?;
            let count = input.read(buffer).map_err(|error| error.to_string())?;
            if count == 0 { break; }
            output.write_all(&buffer[..count]).map_err(|error| error.to_string())?;
            tracker.bytes_copied = tracker.bytes_copied.saturating_add(count as u64);
            tracker.current_file_bytes = tracker.current_file_bytes.saturating_add(count as u64);
            tracker.emit(false);
        }
        drop(output);
        fs::set_permissions(destination, metadata.permissions()).map_err(|error| error.to_string())?;
        tracker.items_completed += 1;
        tracker.emit(false);
        Ok(())
    } else {
        Err("This filesystem item type is not supported.".to_string())
    }
}

fn transfer_native_items_with_progress(
    app: tauri::AppHandle,
    paths: Vec<String>,
    target_path: &str,
    job_id: &str,
    move_items: bool,
    preserve_names: bool,
    control: &TransferJobControl,
) -> NativeOperationResult {
    let mut failures = Vec::new();
    let target = match canonical_directory(target_path) {
        Ok(target) => target,
        Err(error) => return NativeOperationResult {
            completed_paths: Vec::new(),
            failures: paths.into_iter().map(|path| NativeOperationFailure { path, error: error.clone() }).collect(),
        },
    };
    let mut sources: Vec<(String, PathBuf)> = Vec::new();
    for path in paths {
        match canonical_item(&path) {
            Ok(source) => {
                if !sources.iter().any(|(_, existing)| same_or_descendant_path(&source, existing)) {
                    sources.retain(|(_, existing)| !same_or_descendant_path(existing, &source));
                    sources.push((path, source));
                }
            }
            Err(error) => failures.push(NativeOperationFailure { path, error }),
        }
    }
    let mut tracker = TransferProgressTracker {
        app,
        job_id: job_id.to_string(),
        phase: "scanning".to_string(),
        current_item: String::new(),
        bytes_copied: 0,
        total_bytes: 0,
        current_file_bytes: 0,
        current_file_total: 0,
        items_completed: 0,
        total_items: 0,
        last_emit: std::time::Instant::now() - std::time::Duration::from_secs(1),
    };
    let mut valid_sources = Vec::new();
    for (original_path, source) in sources {
        if same_or_descendant_path(&target, &source) {
            failures.push(NativeOperationFailure { path: original_path, error: "A folder cannot be transferred inside itself.".to_string() });
            continue;
        }
        let Some(name) = source.file_name() else {
            failures.push(NativeOperationFailure { path: original_path, error: "A filesystem root cannot be transferred as an item.".to_string() });
            continue;
        };
        let requested_destination = target.join(name);
        if preserve_names
            && (requested_destination.exists()
                || valid_sources.iter().any(|(_, _, destination, _, _)| destination == &requested_destination))
        {
            failures.push(NativeOperationFailure {
                path: original_path,
                error: "UNDO_DESTINATION_CONFLICT".to_string(),
            });
            continue;
        }
        let destination = if preserve_names {
            requested_destination
        } else {
            unique_child_path(&target, &name.to_string_lossy())
        };
        let previous_bytes = tracker.total_bytes;
        let previous_items = tracker.total_items;
        match count_copy_tree(&source, control, &mut tracker) {
            Ok(()) => valid_sources.push((
                original_path,
                source,
                destination,
                tracker.total_bytes.saturating_sub(previous_bytes),
                tracker.total_items.saturating_sub(previous_items),
            )),
            Err(error) => {
                failures.push(NativeOperationFailure { path: original_path, error });
                if let Err(error) = wait_for_transfer_job(control) {
                    failures.push(NativeOperationFailure { path: display_path(&source), error });
                    break;
                }
            }
        }
    }
    tracker.phase = "copying".to_string();
    tracker.current_item.clear();
    tracker.emit(true);
    let mut completed_paths = Vec::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    for (original_path, source, destination, source_bytes, source_items) in valid_sources {
        if wait_for_transfer_job(control).is_err() {
            failures.push(NativeOperationFailure { path: original_path, error: "File transfer cancelled.".to_string() });
            break;
        }
        if move_items && source.parent().is_some_and(|parent| parent == target) {
            tracker.bytes_copied = tracker.bytes_copied.saturating_add(source_bytes);
            tracker.items_completed = tracker.items_completed.saturating_add(source_items);
            tracker.emit(true);
            completed_paths.push(display_path(&source));
            continue;
        }
        let bytes_before = tracker.bytes_copied;
        let items_before = tracker.items_completed;
        let transfer = if move_items {
            match fs::rename(&source, &destination) {
                Ok(()) => {
                    tracker.bytes_copied = tracker.bytes_copied.saturating_add(source_bytes);
                    tracker.items_completed = tracker.items_completed.saturating_add(source_items);
                    tracker.emit(true);
                    Ok(())
                }
                Err(rename_error) => {
                    match copy_path_with_progress(&source, &destination, control, &mut tracker, &mut buffer) {
                        Err(copy_error) => {
                            if destination.exists() {
                                let _ = remove_path_without_following_links(&destination);
                            }
                            Err(format!("Move failed ({rename_error}); copy fallback failed ({copy_error})."))
                        }
                        Ok(()) => match remove_path_without_following_links(&source) {
                            Ok(()) => Ok(()),
                            Err(remove_error) => {
                                let _ = remove_path_without_following_links(&destination);
                                Err(format!("The item was copied, but its original could not be removed ({remove_error})."))
                            }
                        },
                    }
                }
            }
        } else {
            copy_path_with_progress(&source, &destination, control, &mut tracker, &mut buffer)
        };
        match transfer {
            Ok(()) => {
                tracker.emit(true);
                completed_paths.push(display_path(&destination));
            }
            Err(error) => {
                tracker.bytes_copied = bytes_before;
                tracker.items_completed = items_before;
                let cancelled = error.contains("cancelled");
                if destination.exists() {
                    let _ = remove_path_without_following_links(&destination);
                }
                failures.push(NativeOperationFailure { path: original_path, error });
                if cancelled { break; }
            }
        }
    }
    NativeOperationResult { completed_paths, failures }
}


struct ZipSourceEntry {
    source_path: PathBuf,
    archive_name: String,
    is_directory: bool,
    size: u64,
}

fn scan_zip_source_tree(
    root: &Path,
    archive_root: &str,
    control: &TransferJobControl,
    tracker: &mut TransferProgressTracker,
    entries: &mut Vec<ZipSourceEntry>,
) -> Result<(), String> {
    let mut pending = vec![(root.to_path_buf(), archive_root.to_string())];
    while let Some((path, archive_name)) = pending.pop() {
        wait_for_transfer_job(control)?;
        if entries.len() >= MAX_ARCHIVE_MEMBERS {
            return Err("ARCHIVE_SOURCE_TOO_MANY_ENTRIES".to_string());
        }
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Cannot inspect {}: {error}", display_path(&path)))?;
        if metadata.file_type().is_symlink() {
            return Err("ARCHIVE_SOURCE_SYMLINK".to_string());
        }
        tracker.current_item = archive_name.clone();
        tracker.total_items = tracker.total_items.saturating_add(1);
        if metadata.is_dir() {
            entries.push(ZipSourceEntry {
                source_path: path.clone(),
                archive_name: archive_name.clone(),
                is_directory: true,
                size: 0,
            });
            let mut children = fs::read_dir(&path)
                .map_err(|error| format!("Cannot read {}: {error}", display_path(&path)))?
                .map(|entry| entry.map_err(|error| error.to_string()))
                .collect::<Result<Vec<_>, _>>()?;
            children.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());
            for child in children.into_iter().rev() {
                let child_name = child.file_name().to_string_lossy().into_owned();
                pending.push((
                    child.path(),
                    format!("{archive_name}/{child_name}"),
                ));
            }
        } else if metadata.is_file() {
            tracker.total_bytes = tracker.total_bytes.saturating_add(metadata.len());
            entries.push(ZipSourceEntry {
                source_path: path,
                archive_name,
                is_directory: false,
                size: metadata.len(),
            });
        } else {
            return Err("ARCHIVE_UNSUPPORTED_SOURCE".to_string());
        }
        tracker.emit(false);
    }
    Ok(())
}

fn reserve_zip_output(target: &Path, requested_name: &str) -> Result<(PathBuf, fs::File), String> {
    let requested = Path::new(requested_name);
    let stem = requested.file_stem().unwrap_or_default().to_string_lossy();
    let extension = requested
        .extension()
        .map(|value| format!(".{}", value.to_string_lossy()))
        .unwrap_or_else(|| ".zip".to_string());
    for index in 0..=1_000_000u32 {
        let candidate_name = if index == 0 {
            requested_name.to_string()
        } else {
            format!("{stem} ({index}){extension}")
        };
        let candidate = target.join(candidate_name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => return Ok((candidate, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Cannot create ZIP archive: {error}")),
        }
    }
    Err("Cannot create a unique ZIP archive name.".to_string())
}

fn create_zip_with_progress(
    app: tauri::AppHandle,
    paths: Vec<String>,
    target_path: &str,
    archive_name: &str,
    job_id: &str,
    control: &TransferJobControl,
) -> NativeOperationResult {
    let target = match canonical_directory(target_path) {
        Ok(target) => target,
        Err(error) => return NativeOperationResult {
            completed_paths: Vec::new(),
            failures: vec![NativeOperationFailure { path: target_path.to_string(), error }],
        },
    };
    let mut requested_name = archive_name.trim().to_string();
    if requested_name.is_empty() {
        return NativeOperationResult {
            completed_paths: Vec::new(),
            failures: vec![NativeOperationFailure { path: target_path.to_string(), error: "ARCHIVE_OUTPUT_NAME".to_string() }],
        };
    }
    if !requested_name.to_lowercase().ends_with(".zip") {
        requested_name.push_str(".zip");
    }
    if validate_child_name(&requested_name).is_err() {
        return NativeOperationResult {
            completed_paths: Vec::new(),
            failures: vec![NativeOperationFailure { path: requested_name, error: "ARCHIVE_OUTPUT_NAME".to_string() }],
        };
    }

    let mut roots: Vec<PathBuf> = Vec::new();
    for path in &paths {
        let source = match canonical_item(path) {
            Ok(source) => source,
            Err(error) => return NativeOperationResult {
                completed_paths: Vec::new(),
                failures: vec![NativeOperationFailure { path: path.clone(), error }],
            },
        };
        if roots.iter().any(|existing| same_or_descendant_path(&source, existing)) {
            continue;
        }
        roots.retain(|existing| !same_or_descendant_path(existing, &source));
        roots.push(source);
    }
    if roots.is_empty() {
        return NativeOperationResult {
            completed_paths: Vec::new(),
            failures: vec![NativeOperationFailure { path: target_path.to_string(), error: "ARCHIVE_NO_SOURCES".to_string() }],
        };
    }
    if roots.iter().any(|source| same_or_descendant_path(&target, source)) {
        return NativeOperationResult {
            completed_paths: Vec::new(),
            failures: roots.into_iter().map(|source| NativeOperationFailure {
                path: display_path(&source),
                error: "ARCHIVE_OUTPUT_INSIDE_SOURCE".to_string(),
            }).collect(),
        };
    }

    let mut tracker = TransferProgressTracker {
        app,
        job_id: job_id.to_string(),
        phase: "scanning".to_string(),
        current_item: String::new(),
        bytes_copied: 0,
        total_bytes: 0,
        current_file_bytes: 0,
        current_file_total: 0,
        items_completed: 0,
        total_items: 0,
        last_emit: std::time::Instant::now() - std::time::Duration::from_secs(1),
    };
    let mut entries = Vec::new();
    let mut used_archive_roots = std::collections::HashSet::new();
    for source in roots {
        let Some(name) = source.file_name() else {
            return NativeOperationResult {
                completed_paths: Vec::new(),
                failures: vec![NativeOperationFailure { path: display_path(&source), error: "ARCHIVE_INVALID_SOURCE".to_string() }],
            };
        };
        let base_name = name.to_string_lossy().replace('\\', "/");
        let mut archive_root = base_name.clone();
        let mut suffix = 2usize;
        while !used_archive_roots.insert(archive_root.to_lowercase()) {
            archive_root = format!("{base_name} ({suffix})");
            suffix = suffix.saturating_add(1);
        }
        if let Err(error) = scan_zip_source_tree(&source, &archive_root, control, &mut tracker, &mut entries) {
            return NativeOperationResult {
                completed_paths: Vec::new(),
                failures: vec![NativeOperationFailure { path: display_path(&source), error }],
            };
        }
    }
    tracker.emit(true);
    if let Err(error) = wait_for_transfer_job(control) {
        return NativeOperationResult {
            completed_paths: Vec::new(),
            failures: vec![NativeOperationFailure { path: target_path.to_string(), error }],
        };
    }

    let (output_path, output_file) = match reserve_zip_output(&target, &requested_name) {
        Ok(output) => output,
        Err(error) => return NativeOperationResult {
            completed_paths: Vec::new(),
            failures: vec![NativeOperationFailure { path: requested_name, error }],
        },
    };
    tracker.phase = "compressing".to_string();
    tracker.current_item.clear();
    tracker.emit(true);
    let mut zip = ZipWriter::new(output_file);
    let mut buffer = vec![0u8; 512 * 1024];
    let result = (|| -> Result<(), String> {
        for entry in entries {
            wait_for_transfer_job(control)?;
            tracker.current_item = entry.archive_name.clone();
            tracker.current_file_bytes = 0;
            tracker.current_file_total = entry.size;
            if entry.is_directory {
                zip.add_directory(
                    format!("{}/", entry.archive_name.trim_end_matches('/')),
                    SimpleFileOptions::default(),
                ).map_err(|error| format!("Cannot add folder to ZIP: {error}"))?;
            } else {
                let metadata = fs::symlink_metadata(&entry.source_path)
                    .map_err(|error| format!("Cannot inspect {}: {error}", display_path(&entry.source_path)))?;
                if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() != entry.size {
                    return Err("ARCHIVE_SOURCE_CHANGED".to_string());
                }
                zip.start_file(
                    entry.archive_name.clone(),
                    SimpleFileOptions::default()
                        .compression_method(CompressionMethod::Deflated)
                        .large_file(true),
                ).map_err(|error| format!("Cannot add file to ZIP: {error}"))?;
                let mut input = fs::File::open(&entry.source_path)
                    .map_err(|error| format!("Cannot open {}: {error}", display_path(&entry.source_path)))?;
                loop {
                    wait_for_transfer_job(control)?;
                    let count = input.read(&mut buffer).map_err(|error| error.to_string())?;
                    if count == 0 { break; }
                    zip.write_all(&buffer[..count])
                        .map_err(|error| format!("Cannot compress {}: {error}", display_path(&entry.source_path)))?;
                    tracker.bytes_copied = tracker.bytes_copied.saturating_add(count as u64);
                    tracker.current_file_bytes = tracker.current_file_bytes.saturating_add(count as u64);
                    tracker.emit(false);
                }
                if tracker.current_file_bytes != entry.size {
                    return Err("ARCHIVE_SOURCE_CHANGED".to_string());
                }
            }
            tracker.items_completed = tracker.items_completed.saturating_add(1);
            tracker.emit(false);
        }
        wait_for_transfer_job(control)?;
        let output_file = zip.finish().map_err(|error| format!("Cannot finish ZIP archive: {error}"))?;
        output_file.sync_all().map_err(|error| format!("Cannot flush ZIP archive: {error}"))?;
        drop(output_file);
        Ok(())
    })();

    match result {
        Ok(()) => {
            tracker.current_item.clear();
            tracker.current_file_bytes = 0;
            tracker.current_file_total = 0;
            tracker.emit(true);
            NativeOperationResult {
                completed_paths: vec![display_path(&output_path)],
                failures: Vec::new(),
            }
        }
        Err(error) => {
            let error = fs::remove_file(&output_path).err().map_or(error.clone(), |cleanup| {
                format!("{error} Partial ZIP cleanup failed: {cleanup}")
            });
            NativeOperationResult {
                completed_paths: Vec::new(),
                failures: vec![NativeOperationFailure { path: display_path(&output_path), error }],
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCreatedFolder {
    path: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFileClipboard {
    paths: Vec<String>,
    is_cut: bool,
    sequence_number: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCreatedImage {
    path: String,
    name: String,
    size: u64,
    modified_ms: Option<u64>,
    created_ms: Option<u64>,
}

fn validate_child_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    let device_stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end()
        .to_ascii_uppercase();
    let is_reserved_device = matches!(device_stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            device_stem.strip_prefix(prefix).is_some_and(|number| {
                matches!(number, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
            })
        });
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.ends_with('.')
        || trimmed.ends_with(' ')
        || name.chars().any(|c| {
            c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
        })
        || name.encode_utf16().count() > 255
        || is_reserved_device
    {
        return Err("The name is not valid for a Windows file or folder.".to_string());
    }
    Ok(())
}

fn canonical_directory(path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(path);
    if !requested.is_absolute() {
        return Err("The destination must be an absolute folder path.".to_string());
    }
    let metadata = fs::symlink_metadata(requested).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("The destination is not a regular folder.".to_string());
    }
    fs::canonicalize(requested).map_err(|e| e.to_string())
}

fn canonical_item(path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(path);
    if !requested.is_absolute() {
        return Err("The source must be an absolute filesystem path.".to_string());
    }
    let metadata = fs::symlink_metadata(requested).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Symbolic links are not followed by file operations.".to_string());
    }
    fs::canonicalize(requested).map_err(|e| e.to_string())
}

fn same_or_descendant_path(candidate: &Path, root: &Path) -> bool {
    let candidate = display_path(candidate)
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase();
    let root = display_path(root)
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase();
    candidate == root || candidate.starts_with(&format!("{root}\\"))
}

fn unique_child_path(parent: &Path, desired_name: &str) -> PathBuf {
    let first = parent.join(desired_name);
    if !first.exists() {
        return first;
    }
    let desired = Path::new(desired_name);
    let stem = desired.file_stem().unwrap_or_default().to_string_lossy();
    let extension = desired
        .extension()
        .map(|v| format!(".{}", v.to_string_lossy()))
        .unwrap_or_default();
    for index in 1..=1_000_000u32 {
        let candidate = parent.join(format!("{stem} ({index}){extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    first
}

fn remove_path_without_following_links(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

fn create_native_directory(parent_path: &str, name: &str) -> Result<NativeCreatedFolder, String> {
    validate_child_name(name)?;
    let parent = canonical_directory(parent_path)?;
    let requested = unique_child_path(&parent, name);
    fs::create_dir(&requested).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            "An item with that name already exists.".to_string()
        } else {
            e.to_string()
        }
    })?;
    let created = fs::canonicalize(&requested).map_err(|e| e.to_string())?;
    Ok(NativeCreatedFolder {
        path: display_path(&created),
        name: created
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| name.to_string()),
    })
}

fn created_native_entry(path: &Path, fallback_name: &str) -> Result<NativeCreatedFolder, String> {
    let created = fs::canonicalize(path).map_err(|error| error.to_string())?;
    Ok(NativeCreatedFolder {
        path: display_path(&created),
        name: created
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| fallback_name.to_string()),
    })
}

fn create_native_text_file(parent_path: &str, name: &str) -> Result<NativeCreatedFolder, String> {
    validate_child_name(name)?;
    let parent = canonical_directory(parent_path)?;
    let requested = unique_child_path(&parent, name);
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&requested)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "An item with that name already exists.".to_string()
            } else {
                error.to_string()
            }
        })?;
    created_native_entry(&requested, name)
}

#[cfg(target_os = "windows")]
fn create_native_shortcut(
    parent_path: &str,
    name: &str,
    target_path: &str,
) -> Result<NativeCreatedFolder, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{IUnknown, Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    validate_child_name(name)?;
    let parent = canonical_directory(parent_path)?;
    let target = canonical_item(target_path)?;
    let requested = unique_child_path(&parent, name);
    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let shortcut_wide: Vec<u16> = requested.as_os_str().encode_wide().chain(Some(0)).collect();
    let shortcut: IShellLinkW =
        unsafe { CoCreateInstance(&ShellLink, None::<&IUnknown>, CLSCTX_INPROC_SERVER) }
            .map_err(|error| format!("Windows could not create the shortcut: {error}"))?;
    unsafe {
        shortcut
            .SetPath(PCWSTR(target_wide.as_ptr()))
            .map_err(|error| format!("Windows could not set the shortcut target: {error}"))?;
        let persist: IPersistFile = shortcut
            .cast()
            .map_err(|error| format!("Windows could not save the shortcut: {error}"))?;
        persist
            .Save(PCWSTR(shortcut_wide.as_ptr()), true)
            .map_err(|error| format!("Windows could not save the shortcut: {error}"))?;
    }
    created_native_entry(&requested, name)
}

#[cfg(not(target_os = "windows"))]
fn create_native_shortcut(
    _parent_path: &str,
    _name: &str,
    _target_path: &str,
) -> Result<NativeCreatedFolder, String> {
    Err("Windows shortcuts are available only in CyberFiles for Windows.".to_string())
}

fn rename_native_item(source_path: &str, new_name: &str) -> Result<String, String> {
    validate_child_name(new_name)?;
    let source = canonical_item(source_path)?;
    let parent = source
        .parent()
        .ok_or("The selected item has no parent folder.")?;
    let destination = parent.join(new_name);
    let source_key = display_path(&source).to_lowercase();
    let destination_key = display_path(&destination).to_lowercase();
    if source_key == destination_key {
        if source
            .file_name()
            .is_some_and(|name| name.to_string_lossy() == new_name)
        {
            return Ok(display_path(&source));
        }
        let temporary = parent.join(format!(
            ".cyberfiles-rename-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::rename(&source, &temporary).map_err(|e| e.to_string())?;
        if let Err(error) = fs::rename(&temporary, &destination) {
            let rollback = fs::rename(&temporary, &source);
            return Err(match rollback {
                Ok(()) => error.to_string(),
                Err(e) => format!("{error}; rollback failed: {e}"),
            });
        }
    } else {
        fs::rename(&source, &destination).map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists || destination.exists() {
                "An item with that name already exists.".to_string()
            } else {
                e.to_string()
            }
        })?;
    }
    let renamed = fs::canonicalize(&destination).map_err(|e| e.to_string())?;
    Ok(display_path(&renamed))
}

#[tauri::command]
async fn create_directory(
    parent_path: String,
    name: String,
) -> Result<NativeCreatedFolder, String> {
    tauri::async_runtime::spawn_blocking(move || create_native_directory(&parent_path, &name))
        .await
        .map_err(|e| format!("Folder creation worker failed: {e}"))?
}

#[tauri::command]
async fn create_text_file(
    parent_path: String,
    name: String,
) -> Result<NativeCreatedFolder, String> {
    tauri::async_runtime::spawn_blocking(move || create_native_text_file(&parent_path, &name))
        .await
        .map_err(|error| format!("File creation worker failed: {error}"))?
}

#[tauri::command]
async fn create_shortcut(
    parent_path: String,
    name: String,
    target_path: String,
) -> Result<NativeCreatedFolder, String> {
    tauri::async_runtime::spawn_blocking(move || {
        create_native_shortcut(&parent_path, &name, &target_path)
    })
    .await
    .map_err(|error| format!("Shortcut creation worker failed: {error}"))?
}

#[tauri::command]
async fn rename_item(path: String, new_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || rename_native_item(&path, &new_name))
        .await
        .map_err(|e| format!("Rename worker failed: {e}"))?
}

fn start_native_transfer_operation(
    app: tauri::AppHandle,
    paths: Vec<String>,
    target_path: String,
    job_id: String,
    move_items: bool,
    preserve_names: bool,
) -> Result<(), String> {
    let control = Arc::new(TransferJobControl {
        state: Mutex::new(TransferJobState::default()),
        changed: Condvar::new(),
    });
    {
        let mut jobs = transfer_jobs().lock().map_err(|_| "File transfer queue is unavailable.".to_string())?;
        if jobs.contains_key(&job_id) {
            return Err("A file transfer with this identifier already exists.".to_string());
        }
        jobs.insert(job_id.clone(), Arc::clone(&control));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let result = transfer_native_items_with_progress(app.clone(), paths, &target_path, &job_id, move_items, preserve_names, &control);
        if let Ok(mut jobs) = transfer_jobs().lock() {
            jobs.remove(&job_id);
        }
        let _ = app.emit("transfer-operation-finished", TransferOperationFinished { job_id, result });
    });
    Ok(())
}

#[tauri::command]
fn start_copy_operation(app: tauri::AppHandle, paths: Vec<String>, target_path: String, job_id: String, preserve_names: bool) -> Result<(), String> {
    start_native_transfer_operation(app, paths, target_path, job_id, false, preserve_names)
}

#[tauri::command]
fn start_move_operation(app: tauri::AppHandle, paths: Vec<String>, target_path: String, job_id: String, preserve_names: bool) -> Result<(), String> {
    start_native_transfer_operation(app, paths, target_path, job_id, true, preserve_names)
}

#[tauri::command]
fn pause_transfer_operation(job_id: String) -> Result<(), String> {
    if let Some(control) = find_transfer_job(&job_id)? {
        if let Ok(mut state) = control.state.lock() { state.paused = true; }
    }
    Ok(())
}

#[tauri::command]
fn resume_transfer_operation(job_id: String) -> Result<(), String> {
    if let Some(control) = find_transfer_job(&job_id)? {
        if let Ok(mut state) = control.state.lock() {
            state.paused = false;
            control.changed.notify_all();
        }
    }
    Ok(())
}

#[tauri::command]
fn cancel_transfer_operation(job_id: String) -> Result<(), String> {
    if let Some(control) = find_transfer_job(&job_id)? {
        if let Ok(mut state) = control.state.lock() {
            state.cancelled = true;
            state.paused = false;
            control.changed.notify_all();
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn set_windows_file_clipboard(paths: &[String], is_cut: bool) -> Result<u32, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::{
        Foundation::GlobalFree,
        System::{
            DataExchange::{
                CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW,
                SetClipboardData,
            },
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
        },
        UI::Shell::DROPFILES,
    };
    if paths.is_empty() {
        return Err("There are no files to place on the clipboard.".to_string());
    }
    let mut wide_paths = Vec::new();
    for path in paths {
        let canonical = canonical_item(path)?;
        wide_paths.extend(std::ffi::OsStr::new(&canonical).encode_wide());
        wide_paths.push(0);
    }
    wide_paths.push(0);
    let header_size = std::mem::size_of::<DROPFILES>();
    let file_list = unsafe { GlobalAlloc(GMEM_MOVEABLE, header_size + wide_paths.len() * 2) };
    if file_list.is_null() {
        return Err("Windows could not allocate file clipboard data.".to_string());
    }
    let data = unsafe { GlobalLock(file_list) }.cast::<u8>();
    if data.is_null() {
        unsafe {
            GlobalFree(file_list);
        }
        return Err("Windows could not lock file clipboard data.".to_string());
    }
    unsafe {
        std::ptr::write_bytes(data, 0, header_size);
        let header = data.cast::<DROPFILES>();
        (*header).pFiles = header_size as u32;
        (*header).fWide = 1;
        std::ptr::copy_nonoverlapping(
            wide_paths.as_ptr(),
            data.add(header_size).cast::<u16>(),
            wide_paths.len(),
        );
        GlobalUnlock(file_list);
    }

    let effect_name: Vec<u16> = "Preferred DropEffect"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let effect_format = unsafe { RegisterClipboardFormatW(effect_name.as_ptr()) };
    let effect_handle = unsafe { GlobalAlloc(GMEM_MOVEABLE, 4) };
    if effect_format == 0 || effect_handle.is_null() {
        unsafe {
            GlobalFree(file_list);
            if !effect_handle.is_null() {
                GlobalFree(effect_handle);
            }
        }
        return Err("Windows could not prepare the file transfer format.".to_string());
    }
    let effect = unsafe { GlobalLock(effect_handle) }.cast::<u32>();
    if effect.is_null() {
        unsafe {
            GlobalFree(file_list);
            GlobalFree(effect_handle);
        }
        return Err("Windows could not lock file transfer data.".to_string());
    }
    unsafe {
        *effect = if is_cut { 2 } else { 1 };
        GlobalUnlock(effect_handle);
    }
    if unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 {
        unsafe {
            GlobalFree(file_list);
            GlobalFree(effect_handle);
        }
        return Err("Windows could not open the clipboard. Try again shortly.".to_string());
    }
    let mut owns_files = true;
    let mut owns_effect = true;
    let result = unsafe {
        if EmptyClipboard() == 0 {
            Err("Windows could not update the clipboard.".to_string())
        } else if SetClipboardData(15, file_list).is_null() {
            Err("Windows could not place the files on the clipboard.".to_string())
        } else {
            owns_files = false;
            if SetClipboardData(effect_format, effect_handle).is_null() {
                Err("Windows placed the files on the clipboard, but could not mark them as cut or copied.".to_string())
            } else {
                owns_effect = false;
                Ok(())
            }
        }
    };
    unsafe {
        CloseClipboard();
        if owns_files {
            GlobalFree(file_list);
        }
        if owns_effect {
            GlobalFree(effect_handle);
        }
    }
    result?;
    Ok(unsafe { windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber() })
}

#[cfg(not(target_os = "windows"))]
fn set_windows_file_clipboard(_paths: &[String], _is_cut: bool) -> Result<u32, String> {
    Err("File clipboard integration is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn set_file_clipboard(paths: Vec<String>, is_cut: bool) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || set_windows_file_clipboard(&paths, is_cut))
        .await
        .map_err(|e| format!("Clipboard worker failed: {e}"))?
}

#[cfg(target_os = "windows")]
fn get_windows_file_clipboard() -> Result<NativeFileClipboard, String> {
    use windows_sys::Win32::{
        System::{
            DataExchange::{
                GetClipboardData, GetClipboardSequenceNumber, IsClipboardFormatAvailable,
                OpenClipboard, RegisterClipboardFormatW,
            },
            Memory::{GlobalLock, GlobalSize, GlobalUnlock},
        },
        UI::Shell::{DragQueryFileW, HDROP},
    };
    const CF_HDROP: u32 = 15;
    if unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 {
        return Err("Windows could not open the clipboard. Try again shortly.".to_string());
    }
    struct ClipboardGuard;
    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe {
                windows_sys::Win32::System::DataExchange::CloseClipboard();
            }
        }
    }
    let _guard = ClipboardGuard;
    let sequence_number = unsafe { GetClipboardSequenceNumber() };
    if unsafe { IsClipboardFormatAvailable(CF_HDROP) } == 0 {
        return Ok(NativeFileClipboard {
            paths: Vec::new(),
            is_cut: false,
            sequence_number,
        });
    }
    let drop_handle = unsafe { GetClipboardData(CF_HDROP) } as HDROP;
    if drop_handle.is_null() {
        return Err("Windows could not read file paths from the clipboard.".to_string());
    }
    let count = unsafe { DragQueryFileW(drop_handle, u32::MAX, std::ptr::null_mut(), 0) };
    let mut paths = Vec::with_capacity(count as usize);
    for index in 0..count {
        let length =
            unsafe { DragQueryFileW(drop_handle, index, std::ptr::null_mut(), 0) } as usize;
        if length == 0 {
            continue;
        }
        let mut buffer = vec![0u16; length + 1];
        let written =
            unsafe { DragQueryFileW(drop_handle, index, buffer.as_mut_ptr(), buffer.len() as u32) }
                as usize;
        buffer.truncate(written);
        paths.push(String::from_utf16_lossy(&buffer));
    }
    let name: Vec<u16> = "Preferred DropEffect"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let format = unsafe { RegisterClipboardFormatW(name.as_ptr()) };
    let handle = if format == 0 {
        std::ptr::null_mut()
    } else {
        unsafe { GetClipboardData(format) }
    };
    let is_cut = if handle.is_null() || unsafe { GlobalSize(handle) } < std::mem::size_of::<u32>() {
        false
    } else {
        let effect = unsafe { GlobalLock(handle) }.cast::<u32>();
        if effect.is_null() {
            false
        } else {
            let value = unsafe { std::ptr::read_unaligned(effect) };
            unsafe {
                GlobalUnlock(handle);
            }
            value & 2 != 0
        }
    };
    Ok(NativeFileClipboard {
        paths,
        is_cut,
        sequence_number,
    })
}

#[cfg(target_os = "windows")]
fn read_windows_clipboard_text() -> Result<String, String> {
    use windows_sys::Win32::System::{
        DataExchange::{
            CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
        },
        Memory::{GlobalLock, GlobalSize, GlobalUnlock},
    };
    const CF_UNICODETEXT: u32 = 13;

    if unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 {
        return Err("Windows could not open the clipboard. Try again shortly.".to_string());
    }
    struct ClipboardGuard;
    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }
    let _guard = ClipboardGuard;
    if unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT) } == 0 {
        return Ok(String::new());
    }
    let handle = unsafe { GetClipboardData(CF_UNICODETEXT) };
    if handle.is_null() {
        return Err("Windows could not read text from the clipboard.".to_string());
    }
    let size = unsafe { GlobalSize(handle) } / std::mem::size_of::<u16>();
    if size == 0 {
        return Ok(String::new());
    }
    let text = unsafe { GlobalLock(handle) }.cast::<u16>();
    if text.is_null() {
        return Err("Windows could not read text from the clipboard.".to_string());
    }
    let wide = unsafe { std::slice::from_raw_parts(text, size) };
    let length = wide
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(wide.len());
    let value = String::from_utf16_lossy(&wide[..length]);
    unsafe {
        GlobalUnlock(handle);
    }
    Ok(value)
}

#[cfg(not(target_os = "windows"))]
fn read_windows_clipboard_text() -> Result<String, String> {
    Err("Clipboard text integration is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn read_clipboard_text() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(read_windows_clipboard_text)
        .await
        .map_err(|error| format!("Clipboard worker failed: {error}"))?
}

#[cfg(not(target_os = "windows"))]
fn get_windows_file_clipboard() -> Result<NativeFileClipboard, String> {
    Err("File clipboard integration is available only in the Windows desktop app.".to_string())
}

#[cfg(target_os = "windows")]
fn clear_windows_file_clipboard(expected_sequence_number: u32) -> Result<bool, String> {
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardSequenceNumber, OpenClipboard,
    };
    if unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 {
        return Err("Windows could not open the clipboard. Try again shortly.".to_string());
    }
    let same_contents = unsafe { GetClipboardSequenceNumber() } == expected_sequence_number;
    let cleared = !same_contents || unsafe { EmptyClipboard() } != 0;
    unsafe {
        CloseClipboard();
    }
    if !cleared {
        return Err(
            "Windows could not clear the completed file transfer from the clipboard.".to_string(),
        );
    }
    Ok(same_contents)
}

#[cfg(not(target_os = "windows"))]
fn clear_windows_file_clipboard(_expected_sequence_number: u32) -> Result<bool, String> {
    Err("File clipboard integration is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn get_file_clipboard() -> Result<NativeFileClipboard, String> {
    tauri::async_runtime::spawn_blocking(get_windows_file_clipboard)
        .await
        .map_err(|e| format!("Clipboard worker failed: {e}"))?
}

#[tauri::command]
async fn clear_file_clipboard(sequence_number: u32) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || clear_windows_file_clipboard(sequence_number))
        .await
        .map_err(|e| format!("Clipboard worker failed: {e}"))?
}

const MAX_CLIPBOARD_IMAGE_BYTES: usize = 256 * 1024 * 1024;

fn dib_to_bmp_bytes(dib: &[u8]) -> Result<Vec<u8>, String> {
    if dib.len() < 40 {
        return Err("The clipboard bitmap header is incomplete.".to_string());
    }
    let read_u32 = |offset: usize| -> Result<u32, String> {
        let bytes = dib
            .get(offset..offset + 4)
            .ok_or_else(|| "The clipboard bitmap header is incomplete.".to_string())?;
        Ok(u32::from_le_bytes(
            bytes.try_into().expect("four byte slice"),
        ))
    };
    let header_size = read_u32(0)? as usize;
    if header_size < 40 || header_size > dib.len() {
        return Err("The clipboard bitmap header is not supported.".to_string());
    }
    let bits_per_pixel = u16::from_le_bytes([dib[14], dib[15]]) as u32;
    let compression = read_u32(16)?;
    let colors_used = read_u32(32)? as usize;
    let external_masks = if header_size == 40 {
        match compression {
            3 => 12,
            6 => 16,
            _ => 0,
        }
    } else {
        0
    };
    let palette_entries = if colors_used > 0 {
        colors_used
    } else if bits_per_pixel <= 8 {
        1usize << bits_per_pixel
    } else {
        0
    };
    let pixel_data_offset = 14usize
        .checked_add(header_size)
        .and_then(|offset| offset.checked_add(external_masks))
        .and_then(|offset| offset.checked_add(palette_entries.checked_mul(4)?))
        .ok_or_else(|| "The clipboard bitmap is too large.".to_string())?;
    if pixel_data_offset > 14 + dib.len() || 14 + dib.len() > u32::MAX as usize {
        return Err("The clipboard bitmap data is incomplete or too large.".to_string());
    }

    let file_size = (14 + dib.len()) as u32;
    let mut bmp = Vec::with_capacity(file_size as usize);
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&file_size.to_le_bytes());
    bmp.extend_from_slice(&[0; 4]);
    bmp.extend_from_slice(&(pixel_data_offset as u32).to_le_bytes());
    bmp.extend_from_slice(dib);
    Ok(bmp)
}

fn apply_clipboard_image_limits(reader: &mut image::ImageReader<impl io::BufRead + io::Seek>) {
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16_384);
    limits.max_image_height = Some(16_384);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
}

fn validate_clipboard_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("The clipboard PNG data is invalid or exceeds the 256 MB limit.".to_string());
    }
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes), image::ImageFormat::Png);
    apply_clipboard_image_limits(&mut reader);
    reader
        .decode()
        .map_err(|error| format!("Windows clipboard PNG could not be decoded: {error}"))?;
    Ok(bytes.to_vec())
}

fn clipboard_bitmap_to_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
        return Err("The clipboard image exceeds the 256 MB limit.".to_string());
    }
    let bmp = dib_to_bmp_bytes(bytes)?;
    let mut reader = image::ImageReader::with_format(Cursor::new(bmp), image::ImageFormat::Bmp);
    apply_clipboard_image_limits(&mut reader);
    let bitmap = reader
        .decode()
        .map_err(|error| format!("Windows clipboard image could not be decoded: {error}"))?;
    let mut output = Cursor::new(Vec::new());
    bitmap
        .write_to(&mut output, image::ImageFormat::Png)
        .map_err(|error| format!("Could not encode clipboard image as PNG: {error}"))?;
    let png = output.into_inner();
    if png.len() > MAX_CLIPBOARD_IMAGE_BYTES {
        return Err("The converted clipboard image exceeds the 256 MB limit.".to_string());
    }
    Ok(png)
}

#[cfg(target_os = "windows")]
fn copy_windows_clipboard_format(format: u32) -> Result<Option<Vec<u8>>, String> {
    use windows_sys::Win32::System::{
        DataExchange::{
            CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
        },
        Memory::{GlobalLock, GlobalSize, GlobalUnlock},
    };

    if format == 0 || unsafe { OpenClipboard(std::ptr::null_mut()) } == 0 {
        return if format == 0 {
            Ok(None)
        } else {
            Err("Windows could not open the clipboard. Try again shortly.".to_string())
        };
    }
    struct ClipboardGuard;
    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe { CloseClipboard() };
        }
    }
    let _guard = ClipboardGuard;
    if unsafe { IsClipboardFormatAvailable(format) } == 0 {
        return Ok(None);
    }
    let handle = unsafe { GetClipboardData(format) };
    if handle.is_null() {
        return Ok(None);
    }
    let size = unsafe { GlobalSize(handle) };
    if size == 0 {
        return Ok(None);
    }
    if size > MAX_CLIPBOARD_IMAGE_BYTES {
        return Err("The clipboard image exceeds the 256 MB limit.".to_string());
    }
    let locked = unsafe { GlobalLock(handle) }.cast::<u8>();
    if locked.is_null() {
        return Err("Windows could not read the clipboard image data.".to_string());
    }
    let bytes = unsafe { std::slice::from_raw_parts(locked, size) }.to_vec();
    unsafe { GlobalUnlock(handle) };
    Ok(Some(bytes))
}

#[cfg(target_os = "windows")]
fn read_windows_clipboard_image_png() -> Result<Option<Vec<u8>>, String> {
    use windows_sys::Win32::System::DataExchange::RegisterClipboardFormatW;

    const CF_DIB: u32 = 8;
    const CF_DIBV5: u32 = 17;
    let png_name: Vec<u16> = "PNG".encode_utf16().chain(Some(0)).collect();
    let png_mime_name: Vec<u16> = "image/png".encode_utf16().chain(Some(0)).collect();
    let formats = [
        (unsafe { RegisterClipboardFormatW(png_name.as_ptr()) }, true),
        (
            unsafe { RegisterClipboardFormatW(png_mime_name.as_ptr()) },
            true,
        ),
        (CF_DIBV5, false),
        (CF_DIB, false),
    ];
    let mut decode_error = None;
    for (format, is_png) in formats {
        let Some(bytes) = copy_windows_clipboard_format(format)? else {
            continue;
        };
        let png = if is_png {
            validate_clipboard_png(&bytes)
        } else {
            clipboard_bitmap_to_png(&bytes)
        };
        match png {
            Ok(data) => return Ok(Some(data)),
            Err(error) => decode_error = Some(error),
        }
    }
    if let Some(error) = decode_error {
        Err(error)
    } else {
        Ok(None)
    }
}

#[cfg(not(target_os = "windows"))]
fn read_windows_clipboard_image_png() -> Result<Option<Vec<u8>>, String> {
    Err("Clipboard image paste is available only in the Windows desktop app.".to_string())
}

fn create_native_clipboard_image(
    target_path: &str,
    base_name: &str,
) -> Result<Option<NativeCreatedImage>, String> {
    let Some(png_bytes) = read_windows_clipboard_image_png()? else {
        return Ok(None);
    };
    let parent = canonical_directory(target_path)?;
    let base = base_name.trim();
    validate_child_name(base)?;

    for index in 0..=1_000_000u32 {
        let name = if index == 0 {
            format!("{base}.png")
        } else {
            format!("{base} ({index}).png")
        };
        let candidate = parent.join(&name);
        let mut file = match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not create the pasted image: {error}")),
        };
        if let Err(error) = file.write_all(&png_bytes) {
            drop(file);
            let _ = fs::remove_file(&candidate);
            return Err(format!("Could not write the pasted image: {error}"));
        }
        drop(file);
        let metadata = match fs::metadata(&candidate) {
            Ok(metadata) => metadata,
            Err(error) => {
                let _ = fs::remove_file(&candidate);
                return Err(format!("Could not read pasted image metadata: {error}"));
            }
        };
        let created = match fs::canonicalize(&candidate) {
            Ok(path) => path,
            Err(error) => {
                let _ = fs::remove_file(&candidate);
                return Err(format!("Could not resolve the pasted image path: {error}"));
            }
        };
        return Ok(Some(NativeCreatedImage {
            path: display_path(&created),
            name,
            size: png_bytes.len() as u64,
            modified_ms: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .and_then(|duration| duration.as_millis().try_into().ok()),
            created_ms: metadata
                .created()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .and_then(|duration| duration.as_millis().try_into().ok()),
        }));
    }
    Err("Could not find an available name for the pasted image.".to_string())
}

#[tauri::command]
async fn paste_clipboard_image(
    target_path: String,
    base_name: String,
) -> Result<Option<NativeCreatedImage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        create_native_clipboard_image(&target_path, &base_name)
    })
    .await
    .map_err(|error| format!("Clipboard image worker failed: {error}"))?
}

fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    #[cfg(target_os = "windows")]
    {
        if let Some(unc_path) = value.strip_prefix("\\\\?\\UNC\\") {
            return format!("\\\\{unc_path}");
        }
        if let Some(drive_path) = value.strip_prefix("\\\\?\\") {
            return drive_path.to_string();
        }
    }
    value.to_string()
}

fn is_hidden_metadata(metadata: &fs::Metadata) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x2 != 0
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = metadata;
        false
    }
}

#[tauri::command]
async fn list_directory(path: String, offset: usize) -> Result<DirectoryListing, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root =
            fs::canonicalize(&path).map_err(|error| format!("Cannot access folder: {error}"))?;
        if !root.is_dir() {
            return Err("The selected location is not a folder.".to_string());
        }

        let root_name = root
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string());
        let read_dir =
            fs::read_dir(&root).map_err(|error| format!("Cannot read folder: {error}"))?;
        // Read only one page and do not recurse. The blocking filesystem work runs
        // off the UI thread so slow disks and network folders remain responsive.
        let raw_entries: Vec<_> = read_dir
            .flatten()
            .skip(offset)
            .take(DIRECTORY_PAGE_SIZE + 1)
            .collect();
        let has_more = raw_entries.len() > DIRECTORY_PAGE_SIZE;
        let page_len = raw_entries.len().min(DIRECTORY_PAGE_SIZE);
        let mut entries = Vec::with_capacity(page_len);

        for entry in raw_entries.into_iter().take(page_len) {
            let entry_path = entry.path();
            let Ok(metadata) = fs::symlink_metadata(&entry_path) else {
                continue;
            };
            // Do not follow links outside the user-selected workspace.
            if metadata.file_type().is_symlink() {
                continue;
            }

            let is_folder = metadata.is_dir();
            let modified_ms = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .and_then(|duration| duration.as_millis().try_into().ok());
            let created_ms = metadata
                .created()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .and_then(|duration| duration.as_millis().try_into().ok());

            entries.push(NativeFolderEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: display_path(&entry_path),
                is_folder,
                is_hidden: is_hidden_metadata(&metadata),
                size: if is_folder { 0 } else { metadata.len() },
                modified_ms,
                created_ms,
            });
        }

        Ok(DirectoryListing {
            root_path: display_path(&root),
            root_name,
            entries,
            has_more,
            next_offset: offset + page_len,
        })
    })
    .await
    .map_err(|error| format!("Folder scan worker failed: {error}"))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderSizeCalculation {
    size: u64,
    entries_scanned: usize,
    complete: bool,
}

#[derive(Default)]
struct FolderSizeJobState {
    paused: bool,
    cancelled: bool,
}

struct FolderSizeJobControl {
    state: Mutex<FolderSizeJobState>,
    changed: Condvar,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderSizeJobProgress {
    job_id: String,
    size: u64,
    entries_scanned: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderSizeJobResult {
    job_id: String,
    size: Option<u64>,
    error: Option<String>,
}

static FOLDER_SIZE_JOBS: OnceLock<Mutex<HashMap<String, Arc<FolderSizeJobControl>>>> = OnceLock::new();

fn folder_size_jobs() -> &'static Mutex<HashMap<String, Arc<FolderSizeJobControl>>> {
    FOLDER_SIZE_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn find_folder_size_job(job_id: &str) -> Result<Option<Arc<FolderSizeJobControl>>, String> {
    let jobs = folder_size_jobs()
        .lock()
        .map_err(|_| "Folder size job registry is unavailable.".to_string())?;
    Ok(jobs.get(job_id).cloned())
}

fn calculate_directory_size_controlled(
    root: &Path,
    control: &FolderSizeJobControl,
    app: &tauri::AppHandle,
    job_id: &str,
) -> Result<u64, String> {
    let mut pending = vec![root.to_path_buf()];
    let mut total = 0u64;
    let mut entries_scanned = 0usize;
    let mut last_emit = std::time::Instant::now() - std::time::Duration::from_secs(1);
    while let Some(directory) = pending.pop() {
        let entries = fs::read_dir(&directory)
            .map_err(|error| format!("Cannot read {}: {error}", display_path(&directory)))?;
        for entry in entries {
            let mut state = control
                .state
                .lock()
                .map_err(|_| "Folder size calculation state is unavailable.".to_string())?;
            while state.paused && !state.cancelled {
                state = control
                    .changed
                    .wait(state)
                    .map_err(|_| "Folder size calculation state is unavailable.".to_string())?;
            }
            if state.cancelled {
                return Err("Folder size calculation cancelled.".to_string());
            }
            drop(state);

            let entry = entry.map_err(|error| {
                format!(
                    "Cannot read an entry in {}: {error}",
                    display_path(&directory)
                )
            })?;
            let path = entry.path();
            entries_scanned += 1;
            let metadata = fs::symlink_metadata(&path)
                .map_err(|error| format!("Cannot inspect {}: {error}", display_path(&path)))?;
            if !metadata.file_type().is_symlink() {
                if metadata.is_dir() {
                    pending.push(path);
                } else if metadata.is_file() {
                    total = total
                        .checked_add(metadata.len())
                        .ok_or_else(|| "The folder size exceeds the supported range.".to_string())?;
                }
            }
            if last_emit.elapsed() >= std::time::Duration::from_millis(220) {
                let _ = app.emit("folder-size-calculation-progress", FolderSizeJobProgress {
                    job_id: job_id.to_string(), size: total, entries_scanned,
                });
                last_emit = std::time::Instant::now();
            }
        }
    }
    let _ = app.emit("folder-size-calculation-progress", FolderSizeJobProgress {
        job_id: job_id.to_string(), size: total, entries_scanned,
    });
    Ok(total)
}

#[tauri::command]
fn start_folder_size_calculation(app: tauri::AppHandle, path: String, job_id: String) -> Result<(), String> {
    let root = fs::canonicalize(&path).map_err(|error| format!("Cannot access folder: {error}"))?;
    if !root.is_dir() {
        return Err("The selected location is not a folder.".to_string());
    }

    let control = Arc::new(FolderSizeJobControl {
        state: Mutex::new(FolderSizeJobState::default()),
        changed: Condvar::new(),
    });
    {
        let mut jobs = folder_size_jobs()
            .lock()
            .map_err(|_| "Folder size job registry is unavailable.".to_string())?;
        if jobs.contains_key(&job_id) {
            return Err("A folder size calculation with this identifier already exists.".to_string());
        }
        jobs.insert(job_id.clone(), Arc::clone(&control));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let result = calculate_directory_size_controlled(&root, &control, &app, &job_id);
        if let Ok(mut jobs) = folder_size_jobs().lock() {
            jobs.remove(&job_id);
        }
        let payload = match result {
            Ok(size) => FolderSizeJobResult { job_id, size: Some(size), error: None },
            Err(error) => FolderSizeJobResult { job_id, size: None, error: Some(error) },
        };
        let _ = app.emit("folder-size-calculation-finished", payload);
    });
    Ok(())
}

#[tauri::command]
fn pause_folder_size_calculation(job_id: String) -> Result<(), String> {
    let Some(control) = find_folder_size_job(&job_id)? else { return Ok(()); };
    let mut state = control
        .state
        .lock()
        .map_err(|_| "Folder size calculation state is unavailable.".to_string())?;
    if !state.cancelled {
        state.paused = true;
    }
    Ok(())
}

#[tauri::command]
fn resume_folder_size_calculation(job_id: String) -> Result<(), String> {
    let Some(control) = find_folder_size_job(&job_id)? else { return Ok(()); };
    let mut state = control
        .state
        .lock()
        .map_err(|_| "Folder size calculation state is unavailable.".to_string())?;
    if !state.cancelled {
        state.paused = false;
        control.changed.notify_all();
    }
    Ok(())
}

#[tauri::command]
fn cancel_folder_size_calculation(job_id: String) -> Result<(), String> {
    let Some(control) = find_folder_size_job(&job_id)? else { return Ok(()); };
    let mut state = control
        .state
        .lock()
        .map_err(|_| "Folder size calculation state is unavailable.".to_string())?;
    state.cancelled = true;
    state.paused = false;
    control.changed.notify_all();
    Ok(())
}

fn calculate_directory_size(
    root: &Path,
    max_entries: Option<usize>,
) -> Result<FolderSizeCalculation, String> {
    let mut pending = vec![root.to_path_buf()];
    let mut total = 0u64;
    let mut entries_scanned = 0usize;
    while let Some(directory) = pending.pop() {
        let entries = fs::read_dir(&directory)
            .map_err(|error| format!("Cannot read {}: {error}", display_path(&directory)))?;
        for entry in entries {
            if max_entries.is_some_and(|limit| entries_scanned >= limit) {
                return Ok(FolderSizeCalculation {
                    size: total,
                    entries_scanned,
                    complete: false,
                });
            }
            let entry = entry.map_err(|error| {
                format!(
                    "Cannot read an entry in {}: {error}",
                    display_path(&directory)
                )
            })?;
            entries_scanned += 1;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)
                .map_err(|error| format!("Cannot inspect {}: {error}", display_path(&path)))?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                pending.push(path);
            } else if metadata.is_file() {
                total = total
                    .checked_add(metadata.len())
                    .ok_or_else(|| "The folder size exceeds the supported range.".to_string())?;
            }
        }
    }
    Ok(FolderSizeCalculation {
        size: total,
        entries_scanned,
        complete: true,
    })
}

#[tauri::command]
async fn calculate_folder_size(path: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root =
            fs::canonicalize(&path).map_err(|error| format!("Cannot access folder: {error}"))?;
        if !root.is_dir() {
            return Err("The selected location is not a folder.".to_string());
        }
        calculate_directory_size(&root, None).map(|result| result.size)
    })
    .await
    .map_err(|error| format!("Folder size worker failed: {error}"))?
}

#[tauri::command]
async fn calculate_folder_size_bounded(
    path: String,
    max_entries: usize,
) -> Result<FolderSizeCalculation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root =
            fs::canonicalize(&path).map_err(|error| format!("Cannot access folder: {error}"))?;
        if !root.is_dir() {
            return Err("The selected location is not a folder.".to_string());
        }
        calculate_directory_size(&root, Some(max_entries.clamp(1, 50_000)))
    })
    .await
    .map_err(|error| format!("Folder size worker failed: {error}"))?
}

const MAX_TEXT_PREVIEW_BYTES: u64 = 200_000;
const MAX_PDF_PREVIEW_BYTES: u64 = 100 * 1024 * 1024;

fn is_text_preview_extension_allowed(path: &Path) -> bool {
    let filename = path
        .file_name()
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let is_common_dotfile = matches!(
        filename.as_str(),
        ".editorconfig"
            | ".env"
            | ".gitattributes"
            | ".gitignore"
            | ".npmrc"
            | "dockerfile"
            | "license"
            | "makefile"
            | "readme"
    );
    if filename.starts_with(".env.") || is_common_dotfile {
        return true;
    }
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    matches!(
        extension.as_str(),
        "bat"
            | "c"
            | "cfg"
            | "cmd"
            | "cpp"
            | "css"
            | "csv"
            | "env"
            | "go"
            | "h"
            | "htm"
            | "html"
            | "ini"
            | "java"
            | "js"
            | "jsx"
            | "json"
            | "jsonl"
            | "log"
            | "md"
            | "markdown"
            | "php"
            | "properties"
            | "ps1"
            | "py"
            | "rb"
            | "rs"
            | "sh"
            | "sql"
            | "toml"
            | "ts"
            | "tsx"
            | "txt"
            | "xml"
            | "yaml"
            | "yml"
    )
}

const MAX_ARCHIVE_MEMBERS: usize = 50_000;
const MAX_ARCHIVE_PREVIEW_ENTRIES: usize = 500;
const MAX_ARCHIVE_TOTAL_BYTES: u64 = 100 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_FILE_BYTES: u64 = 50 * 1024 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchivePreviewEntry {
    name: String,
    is_directory: bool,
    size: u64,
    compressed_size: u64,
    unsafe_path: bool,
    link: bool,
    extractable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchivePreview {
    entries: Vec<ArchivePreviewEntry>,
    total_entries: usize,
    total_bytes: u64,
    truncated: bool,
}

struct ArchiveMember {
    index: usize,
    name: String,
    relative_path: Option<PathBuf>,
    is_directory: bool,
    size: u64,
    compressed_size: u64,
    is_link: bool,
    extractable: bool,
    encrypted: bool,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum ArchiveExtractionMode {
    Here,
    Folder,
}

fn archive_extension(path: &Path) -> Result<&str, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match extension.as_str() {
        "zip" | "rar" => Ok(if extension == "zip" { "zip" } else { "rar" }),
        _ => Err("Only ZIP and RAR archives are supported.".to_string()),
    }
}

fn safe_archive_relative_path(raw_name: &str, is_rar: bool) -> Option<PathBuf> {
    if raw_name.is_empty() || raw_name.contains('\0') {
        return None;
    }
    let normalized = raw_name.replace('\\', "/");
    if normalized.starts_with('/') || normalized.starts_with("//") {
        return None;
    }
    if is_rar {
        let sanitized = sanitize_rar_path(raw_name);
        if sanitized.replace('\\', "/") != normalized {
            return None;
        }
    }
    let mut relative = PathBuf::new();
    let parts: Vec<&str> = normalized.split('/').collect();
    for (index, part) in parts.iter().enumerate() {
        if part.is_empty() && index + 1 == parts.len() {
            continue;
        }
        if part.is_empty()
            || *part == "."
            || *part == ".."
            || part.contains(':')
            || part.ends_with('.')
            || part.ends_with(' ')
            || part.chars().any(|character| {
                character.is_control() || matches!(character, '<' | '>' | '"' | '|' | '?' | '*')
            })
        {
            return None;
        }
        let device_name = part
            .split('.')
            .next()
            .unwrap_or("")
            .trim_end_matches([' ', '.'])
            .to_ascii_uppercase();
        if matches!(
            device_name.as_str(),
            "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
        ) || (device_name.len() == 4
            && (device_name.starts_with("COM") || device_name.starts_with("LPT"))
            && device_name.as_bytes()[3].is_ascii_digit()
            && device_name.as_bytes()[3] != b'0')
        {
            return None;
        }
        relative.push(part);
    }
    if relative.as_os_str().is_empty()
        || relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return None;
    }
    Some(relative)
}

fn collect_archive_members(path: &Path, password: Option<&str>) -> Result<Vec<ArchiveMember>, String> {
    let extension = archive_extension(path)?;
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("Cannot inspect archive: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Only regular archive files can be opened.".to_string());
    }
    let resolved = path
        .canonicalize()
        .map_err(|error| format!("Cannot resolve archive: {error}"))?;
    if extension == "zip" {
        let file =
            fs::File::open(&resolved).map_err(|error| format!("Cannot open archive: {error}"))?;
        let mut archive =
            ZipArchive::new(file).map_err(|error| format!("Cannot read ZIP archive: {error}"))?;
        if archive.len() > MAX_ARCHIVE_MEMBERS {
            return Err("ARCHIVE_TOO_MANY_ENTRIES".to_string());
        }
        let mut members = Vec::with_capacity(archive.len());
        for index in 0..archive.len() {
            let entry = archive
                .by_index_raw(index)
                .map_err(|error| format!("Cannot read ZIP entry: {error}"))?;
            let name = entry.name().to_string();
            let encrypted = entry.encrypted();
            let mode = entry.unix_mode().unwrap_or(0);
            let file_type = mode & 0o170000;
            let is_link = file_type == 0o120000
                || (file_type != 0 && file_type != 0o100000 && file_type != 0o040000);
            members.push(ArchiveMember {
                index,
                relative_path: safe_archive_relative_path(&name, false),
                name,
                is_directory: entry.is_dir(),
                size: entry.size(),
                compressed_size: entry.compressed_size(),
                is_link,
                extractable: true,
                encrypted,
            });
        }
        Ok(members)
    } else {
        let file =
            fs::File::open(&resolved).map_err(|error| format!("Cannot open archive: {error}"))?;
        let archive = match password {
            Some(password) => RarArchive::open_with_password(file, password).map_err(|error| match error {
                unrar_rs::RarError::InvalidPassword | unrar_rs::RarError::WrongPassword { .. } => "ARCHIVE_INVALID_PASSWORD".to_string(),
                unrar_rs::RarError::EncryptedArchive => "ARCHIVE_PASSWORD_REQUIRED".to_string(),
                other => format!("Cannot read RAR archive: {other}"),
            })?,
            None => RarArchive::open(file).map_err(|error| match error {
                unrar_rs::RarError::EncryptedArchive => "ARCHIVE_PASSWORD_REQUIRED".to_string(),
                other => format!("Cannot read RAR archive: {other}"),
            })?,
        };
        let has_complete_volume_set = !archive.more_volumes();
        let indexed_members = archive.indexed_member_infos();
        if indexed_members.len() > MAX_ARCHIVE_MEMBERS {
            return Err("ARCHIVE_TOO_MANY_ENTRIES".to_string());
        }
        Ok(indexed_members
            .into_iter()
            .map(|entry| {
                let info = entry.info;
                let raw_name = info.raw_name;
                ArchiveMember {
                    index: entry.index,
                    relative_path: safe_archive_relative_path(&raw_name, true),
                    name: info.name,
                    is_directory: info.is_directory,
                    size: info.unpacked_size.unwrap_or(0),
                    compressed_size: info.compressed_size,
                    is_link: info.is_symlink || info.is_hardlink || info.is_file_copy,
                    extractable: entry.extractable && has_complete_volume_set,
                    encrypted: info.is_encrypted,
                }
            })
            .collect())
    }
}

fn read_archive_preview_blocking(path: &str, password: Option<&str>) -> Result<ArchivePreview, String> {
    let source = Path::new(path);
    let members = collect_archive_members(source, password)?;
    let total_entries = members.len();
    let total_bytes = members
        .iter()
        .fold(0u64, |total, member| total.saturating_add(member.size));
    let entries = members
        .iter()
        .take(MAX_ARCHIVE_PREVIEW_ENTRIES)
        .map(|member| ArchivePreviewEntry {
            name: member.name.clone(),
            is_directory: member.is_directory,
            size: member.size,
            compressed_size: member.compressed_size,
            unsafe_path: member.relative_path.is_none(),
            link: member.is_link,
            extractable: member.extractable,
        })
        .collect();
    Ok(ArchivePreview {
        entries,
        total_entries,
        total_bytes,
        truncated: total_entries > MAX_ARCHIVE_PREVIEW_ENTRIES,
    })
}

#[tauri::command]
async fn read_archive_preview(path: String, password: Option<String>) -> Result<ArchivePreview, String> {
    tauri::async_runtime::spawn_blocking(move || read_archive_preview_blocking(&path, password.as_deref()))
        .await
        .map_err(|error| format!("Archive preview worker failed: {error}"))?
}

struct ArchiveProgressWriter<'a> {
    file: fs::File,
    control: &'a TransferJobControl,
    tracker: &'a mut TransferProgressTracker,
    start_bytes: u64,
    file_bytes: u64,
}

impl Write for ArchiveProgressWriter<'_> {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        wait_for_transfer_job(self.control)
            .map_err(|error| io::Error::new(io::ErrorKind::Interrupted, error))?;
        if self.file_bytes.saturating_add(buffer.len() as u64) > MAX_ARCHIVE_FILE_BYTES
            || self
                .start_bytes
                .saturating_add(self.file_bytes)
                .saturating_add(buffer.len() as u64)
                > MAX_ARCHIVE_TOTAL_BYTES
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "ARCHIVE_SIZE_LIMIT",
            ));
        }
        let written = self.file.write(buffer)?;
        self.file_bytes = self.file_bytes.saturating_add(written as u64);
        self.tracker.bytes_copied = self.start_bytes.saturating_add(self.file_bytes);
        self.tracker.current_file_bytes = self.file_bytes;
        self.tracker.emit(false);
        Ok(written)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

fn create_archive_output_root(parent: &Path, archive_path: &Path, mode: ArchiveExtractionMode) -> Result<PathBuf, String> {
    if mode == ArchiveExtractionMode::Here {
        return Ok(parent.to_path_buf());
    }
    let base = archive_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("Extracted");
    for suffix in 0..=1_000_000u32 {
        let name = if suffix == 0 {
            base.to_string()
        } else {
            format!("{base} ({suffix})")
        };
        if validate_child_name(&name).is_err() {
            return Err("ARCHIVE_OUTPUT_NAME".to_string());
        }
        let candidate = parent.join(name);
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Cannot create extraction folder: {error}")),
        }
    }
    Err("Could not find an unused extraction folder name.".to_string())
}

fn archive_entry_extraction_error(member_name: &str, error: impl std::fmt::Display, encrypted: bool) -> String {
    let error = error.to_string();
    if error.contains("ARCHIVE_SIZE_LIMIT") {
        "ARCHIVE_SIZE_LIMIT".to_string()
    } else if encrypted && (error.to_ascii_lowercase().contains("password") || error.to_ascii_lowercase().contains("crc")) {
        "ARCHIVE_INVALID_PASSWORD".to_string()
    } else {
        format!("Cannot extract {member_name}: {error}")
    }
}

fn archive_failure(path: &str, error: String) -> NativeOperationResult {
    NativeOperationResult {
        completed_paths: Vec::new(),
        failures: vec![NativeOperationFailure {
            path: path.to_string(),
            error,
        }],
    }
}

fn ensure_archive_directory(root: &Path, directory: &Path, created: &mut Vec<PathBuf>) -> Result<(), String> {
    let relative = directory.strip_prefix(root).map_err(|_| "ARCHIVE_UNSAFE_ENTRY".to_string())?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let std::path::Component::Normal(part) = component else {
            return Err("ARCHIVE_UNSAFE_ENTRY".to_string());
        };
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(metadata) => {
                if !metadata.is_dir() || metadata.file_type().is_symlink() {
                    return Err("ARCHIVE_UNSAFE_ENTRY".to_string());
                }
                let resolved = fs::canonicalize(&current).map_err(|_| "ARCHIVE_UNSAFE_ENTRY".to_string())?;
                if !same_or_descendant_path(&resolved, root) {
                    return Err("ARCHIVE_UNSAFE_ENTRY".to_string());
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => match fs::create_dir(&current) {
                Ok(()) => created.push(current.clone()),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                    let metadata = fs::symlink_metadata(&current).map_err(|_| "ARCHIVE_UNSAFE_ENTRY".to_string())?;
                    let resolved = fs::canonicalize(&current).map_err(|_| "ARCHIVE_UNSAFE_ENTRY".to_string())?;
                    if !metadata.is_dir() || metadata.file_type().is_symlink() || !same_or_descendant_path(&resolved, root) {
                        return Err("ARCHIVE_UNSAFE_ENTRY".to_string());
                    }
                }
                Err(error) => return Err(format!("Cannot create folder {}: {error}", display_path(&current))),
            },
            Err(error) => return Err(format!("Cannot inspect folder {}: {error}", display_path(&current))),
        }
    }
    Ok(())
}

fn cleanup_archive_extraction_artifacts(files: &[PathBuf], directories: &[PathBuf]) -> Result<(), String> {
    let mut first_error = None;
    for path in files.iter().rev() {
        match fs::symlink_metadata(path) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                if let Err(error) = fs::remove_file(path) { first_error.get_or_insert(error.to_string()); }
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => { first_error.get_or_insert(error.to_string()); }
        }
    }
    for path in directories.iter().rev() {
        match fs::symlink_metadata(path) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
                if let Err(error) = fs::remove_dir(path) {
                    if error.kind() != io::ErrorKind::DirectoryNotEmpty { first_error.get_or_insert(error.to_string()); }
                }
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => { first_error.get_or_insert(error.to_string()); }
        }
    }
    first_error.map_or(Ok(()), |error| Err(error))
}

fn extract_archive_with_progress(
    app: tauri::AppHandle,
    archive_path: &str,
    target_path: &str,
    job_id: &str,
    extraction_mode: ArchiveExtractionMode,
    password: Option<String>,
    control: &TransferJobControl,
) -> NativeOperationResult {
    let source = match canonical_item(archive_path) {
        Ok(source) => source,
        Err(error) => return archive_failure(archive_path, error),
    };
    let target = match canonical_directory(target_path) {
        Ok(target) => target,
        Err(error) => return archive_failure(archive_path, error),
    };
    let members = match collect_archive_members(&source, password.as_deref()) {
        Ok(members) => members,
        Err(error) => return archive_failure(archive_path, error),
    };
    if members
        .iter()
        .any(|member| member.relative_path.is_none() || member.is_link)
    {
        return archive_failure(archive_path, "ARCHIVE_UNSAFE_ENTRY".to_string());
    }
    if members.iter().any(|member| !member.extractable) {
        return archive_failure(archive_path, "ARCHIVE_ADDITIONAL_VOLUMES".to_string());
    }
    if password.is_none() && members.iter().any(|member| member.encrypted) {
        return archive_failure(archive_path, "ARCHIVE_PASSWORD_REQUIRED".to_string());
    }
    let total_bytes = members
        .iter()
        .fold(0u64, |total, member| total.saturating_add(member.size));
    if total_bytes > MAX_ARCHIVE_TOTAL_BYTES
        || members
            .iter()
            .any(|member| member.size > MAX_ARCHIVE_FILE_BYTES)
    {
        return archive_failure(archive_path, "ARCHIVE_SIZE_LIMIT".to_string());
    }
    if let Err(error) = wait_for_transfer_job(control) {
        return archive_failure(archive_path, error);
    }
    let output_root = match create_archive_output_root(&target, &source, extraction_mode) {
        Ok(path) => path,
        Err(error) => return archive_failure(archive_path, error),
    };
    let mut created_files = Vec::new();
    let mut created_directories = Vec::new();
    let has_dedicated_output_root = extraction_mode == ArchiveExtractionMode::Folder;
    let mut tracker = TransferProgressTracker {
        app,
        job_id: job_id.to_string(),
        phase: "copying".to_string(),
        current_item: String::new(),
        bytes_copied: 0,
        total_bytes,
        current_file_bytes: 0,
        current_file_total: 0,
        items_completed: 0,
        total_items: members.len(),
        last_emit: std::time::Instant::now(),
    };
    tracker.emit(true);

    let result = (|| -> Result<(), String> {
        match archive_extension(&source)? {
            "zip" => {
                let file = fs::File::open(&source)
                    .map_err(|error| format!("Cannot open ZIP archive: {error}"))?;
                let mut archive = ZipArchive::new(file)
                    .map_err(|error| format!("Cannot read ZIP archive: {error}"))?;
                for member in &members {
                    wait_for_transfer_job(control)?;
                    let relative = member
                        .relative_path
                        .as_ref()
                        .expect("archive paths were prevalidated");
                    let output = output_root.join(relative);
                    tracker.current_item = member.name.clone();
                    tracker.current_file_bytes = 0;
                    tracker.current_file_total = member.size;
                    if member.is_directory {
                        ensure_archive_directory(&output_root, &output, &mut created_directories)?;
                    } else {
                        let parent = output
                            .parent()
                            .ok_or_else(|| "Archive entry has no parent folder.".to_string())?;
                        ensure_archive_directory(&output_root, parent, &mut created_directories)?;
                        let output_file = fs::OpenOptions::new()
                            .write(true)
                            .create_new(true)
                            .open(&output)
                            .map_err(|error| {
                                format!("Cannot create {}: {error}", display_path(&output))
                            })?;
                        created_files.push(output.clone());
                        let mut entry = if member.encrypted {
                            let password = password.as_deref().ok_or_else(|| "ARCHIVE_PASSWORD_REQUIRED".to_string())?;
                            archive.by_index_decrypt(member.index, password.as_bytes()).map_err(|error| match error {
                                zip::result::ZipError::InvalidPassword => "ARCHIVE_INVALID_PASSWORD".to_string(),
                                other => format!("Cannot open ZIP entry {}: {other}", member.name),
                            })?
                        } else {
                            archive.by_index(member.index).map_err(|error| format!("Cannot open ZIP entry {}: {error}", member.name))?
                        };
                        if entry.is_dir() || entry.unix_mode().unwrap_or(0) & 0o170000 == 0o120000 {
                            return Err("ARCHIVE_UNSAFE_ENTRY".to_string());
                        }
                        let start_bytes = tracker.bytes_copied;
                        let mut writer = ArchiveProgressWriter {
                            file: output_file,
                            control,
                            tracker: &mut tracker,
                            start_bytes,
                            file_bytes: 0,
                        };
                        io::copy(&mut entry, &mut writer)
                            .map_err(|error| archive_entry_extraction_error(&member.name, error, member.encrypted))?;
                        writer
                            .flush()
                            .map_err(|error| format!("Cannot flush {}: {error}", member.name))?;
                    }
                    tracker.items_completed += 1;
                    tracker.emit(true);
                }
            }
            "rar" => {
                let file = fs::File::open(&source)
                    .map_err(|error| format!("Cannot open RAR archive: {error}"))?;
                let mut archive = match password.as_deref() {
                    Some(password) => RarArchive::open_with_password(file, password).map_err(|error| match error {
                        unrar_rs::RarError::InvalidPassword | unrar_rs::RarError::WrongPassword { .. } => "ARCHIVE_INVALID_PASSWORD".to_string(),
                        unrar_rs::RarError::EncryptedArchive => "ARCHIVE_PASSWORD_REQUIRED".to_string(),
                        other => format!("Cannot read RAR archive: {other}"),
                    })?,
                    None => RarArchive::open(file).map_err(|error| match error {
                        unrar_rs::RarError::EncryptedArchive => "ARCHIVE_PASSWORD_REQUIRED".to_string(),
                        other => format!("Cannot read RAR archive: {other}"),
                    })?,
                };
                let volume_provider =
                    unrar_rs::volume::StaticVolumeProvider::from_ordered(vec![source.clone()]);
                for member in &members {
                    wait_for_transfer_job(control)?;
                    let relative = member
                        .relative_path
                        .as_ref()
                        .expect("archive paths were prevalidated");
                    let output = output_root.join(relative);
                    tracker.current_item = member.name.clone();
                    tracker.current_file_bytes = 0;
                    tracker.current_file_total = member.size;
                    if member.is_directory {
                        ensure_archive_directory(&output_root, &output, &mut created_directories)?;
                    } else {
                        let parent = output
                            .parent()
                            .ok_or_else(|| "Archive entry has no parent folder.".to_string())?;
                        ensure_archive_directory(&output_root, parent, &mut created_directories)?;
                        let output_file = fs::OpenOptions::new()
                            .write(true)
                            .create_new(true)
                            .open(&output)
                            .map_err(|error| {
                                format!("Cannot create {}: {error}", display_path(&output))
                            })?;
                        created_files.push(output.clone());
                        let start_bytes = tracker.bytes_copied;
                        let mut writer = ArchiveProgressWriter {
                            file: output_file,
                            control,
                            tracker: &mut tracker,
                            start_bytes,
                            file_bytes: 0,
                        };
                        archive
                            .extract_member_streaming(
                                member.index,
                                &unrar_rs::ExtractOptions { password: password.clone(), ..unrar_rs::ExtractOptions::default() },
                                &volume_provider,
                                &mut writer,
                            )
                            .map_err(|error| archive_entry_extraction_error(&member.name, error, member.encrypted))?;
                        writer
                            .flush()
                            .map_err(|error| format!("Cannot flush {}: {error}", member.name))?;
                    }
                    tracker.items_completed += 1;
                    tracker.emit(true);
                }
            }
            _ => return Err("Only ZIP and RAR archives are supported.".to_string()),
        }
        wait_for_transfer_job(control)?;
        Ok(())
    })();

    match result {
        Ok(()) => {
            tracker.current_item.clear();
            tracker.current_file_bytes = 0;
            tracker.current_file_total = 0;
            tracker.emit(true);
            NativeOperationResult {
                completed_paths: vec![output_root.to_string_lossy().into_owned()],
                failures: Vec::new(),
            }
        }
        Err(error) => {
            let cleanup_error = if has_dedicated_output_root {
                remove_path_without_following_links(&output_root).err()
            } else {
                cleanup_archive_extraction_artifacts(&created_files, &created_directories).err()
            };
            let error = cleanup_error.map_or(error.clone(), |cleanup| {
                format!("{error} Partial extraction cleanup failed: {cleanup}")
            });
            archive_failure(archive_path, error)
        }
    }
}

fn start_native_archive_extraction_operation(
    app: tauri::AppHandle,
    archive_path: String,
    target_path: String,
    job_id: String,
    extraction_mode: ArchiveExtractionMode,
    password: Option<String>,
) -> Result<(), String> {
    let control = Arc::new(TransferJobControl {
        state: Mutex::new(TransferJobState::default()),
        changed: Condvar::new(),
    });
    {
        let mut jobs = transfer_jobs()
            .lock()
            .map_err(|_| "File operation queue is unavailable.".to_string())?;
        if jobs.contains_key(&job_id) {
            return Err("A file operation with this identifier already exists.".to_string());
        }
        jobs.insert(job_id.clone(), Arc::clone(&control));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let result = extract_archive_with_progress(
            app.clone(),
            &archive_path,
            &target_path,
            &job_id,
            extraction_mode,
            password,
            &control,
        );
        if let Ok(mut jobs) = transfer_jobs().lock() {
            jobs.remove(&job_id);
        }
        let _ = app.emit(
            "transfer-operation-finished",
            TransferOperationFinished { job_id, result },
        );
    });
    Ok(())
}

#[tauri::command]
fn start_archive_extraction(
    app: tauri::AppHandle,
    archive_path: String,
    target_path: String,
    job_id: String,
    extraction_mode: ArchiveExtractionMode,
    password: Option<String>,
) -> Result<(), String> {
    start_native_archive_extraction_operation(app, archive_path, target_path, job_id, extraction_mode, password)
}

fn start_native_zip_compression_operation(
    app: tauri::AppHandle,
    paths: Vec<String>,
    target_path: String,
    archive_name: String,
    job_id: String,
) -> Result<(), String> {
    let control = Arc::new(TransferJobControl {
        state: Mutex::new(TransferJobState::default()),
        changed: Condvar::new(),
    });
    {
        let mut jobs = transfer_jobs()
            .lock()
            .map_err(|_| "File operation queue is unavailable.".to_string())?;
        if jobs.contains_key(&job_id) {
            return Err("A file operation with this identifier already exists.".to_string());
        }
        jobs.insert(job_id.clone(), Arc::clone(&control));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let result = create_zip_with_progress(
            app.clone(),
            paths,
            &target_path,
            &archive_name,
            &job_id,
            &control,
        );
        if let Ok(mut jobs) = transfer_jobs().lock() {
            jobs.remove(&job_id);
        }
        let _ = app.emit(
            "transfer-operation-finished",
            TransferOperationFinished { job_id, result },
        );
    });
    Ok(())
}

#[tauri::command]
fn start_zip_compression(
    app: tauri::AppHandle,
    paths: Vec<String>,
    target_path: String,
    archive_name: String,
    job_id: String,
) -> Result<(), String> {
    start_native_zip_compression_operation(app, paths, target_path, archive_name, job_id)
}

#[tauri::command]
async fn read_text_preview(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file_path = Path::new(&path);
        if !is_text_preview_extension_allowed(file_path) {
            return Err("This file type is not supported for text preview.".to_string());
        }
        let metadata = fs::symlink_metadata(file_path)
            .map_err(|error| format!("Cannot inspect preview file: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("Only regular files can be previewed.".to_string());
        }
        if metadata.len() > MAX_TEXT_PREVIEW_BYTES {
            return Err("The file is too large to preview.".to_string());
        }

        let mut bytes = Vec::with_capacity(metadata.len() as usize);
        fs::File::open(file_path)
            .map_err(|error| format!("Cannot open preview file: {error}"))?
            .take(MAX_TEXT_PREVIEW_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Cannot read preview file: {error}"))?;
        if bytes.len() as u64 > MAX_TEXT_PREVIEW_BYTES {
            return Err("The file is too large to preview.".to_string());
        }
        String::from_utf8(bytes).map_err(|_| "The file is not valid UTF-8 text.".to_string())
    })
    .await
    .map_err(|error| format!("Text preview worker failed: {error}"))?
}

#[tauri::command]
async fn prepare_pdf_preview(app: tauri::AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = Path::new(&path);
        if !source.is_absolute() {
            return Err("Only fully qualified PDF paths can be previewed.".to_string());
        }
        let metadata = fs::symlink_metadata(source)
            .map_err(|error| format!("Cannot inspect PDF preview file: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("Only regular PDF files can be previewed.".to_string());
        }
        if metadata.len() > MAX_PDF_PREVIEW_BYTES {
            return Err("The PDF is too large to preview.".to_string());
        }
        if source
            .extension()
            .and_then(|value| value.to_str())
            .map_or(true, |extension| !extension.eq_ignore_ascii_case("pdf"))
        {
            return Err("Only PDF files can be previewed here.".to_string());
        }

        let resolved = source
            .canonicalize()
            .map_err(|error| format!("Could not resolve PDF preview file: {error}"))?;
        app.asset_protocol_scope()
            .allow_file(&resolved)
            .map_err(|error| format!("Could not authorize PDF preview file: {error}"))?;
        Ok(resolved.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("PDF preview worker failed: {error}"))?
}
#[tauri::command]
async fn image_thumbnail(path: String) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file_path = Path::new(&path);
        let extension = file_path
            .extension()?
            .to_string_lossy()
            .to_ascii_lowercase();
        if !matches!(
            extension.as_str(),
            "bmp" | "gif" | "jpeg" | "jpg" | "png" | "webp"
        ) {
            return None;
        }
        if fs::metadata(file_path).ok()?.len() > 64 * 1024 * 1024 {
            return None;
        }

        let mut reader = image::ImageReader::open(file_path)
            .ok()?
            .with_guessed_format()
            .ok()?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(12_000);
        limits.max_image_height = Some(12_000);
        limits.max_alloc = Some(64 * 1024 * 1024);
        reader.limits(limits);

        let thumbnail = reader.decode().ok()?.thumbnail(256, 176);
        let mut png = Cursor::new(Vec::new());
        thumbnail.write_to(&mut png, image::ImageFormat::Png).ok()?;
        Some(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png.into_inner())
        ))
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
async fn get_file_icons(
    items: Vec<NativeFileIconRequest>,
    large: bool,
) -> Result<Vec<NativeFileIconGroup>, String> {
    const MAX_ICON_BATCH_SIZE: usize = 48;
    if items.len() > MAX_ICON_BATCH_SIZE {
        return Err("Too many file icons were requested at once.".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let Some(_shell_apartment) = windows_file_icons::ShellApartment::initialize() else {
            return Ok(Vec::new());
        };
        let mut grouped_icons: HashMap<String, Vec<String>> = HashMap::new();
        for item in items {
            if item.path.len() > 32_767 || item.id.len() > 32_767 {
                continue;
            }
            if let Some(data_url) = windows_file_icons::get_associated_file_icon(&item.path, large) {
                grouped_icons.entry(data_url).or_default().push(item.id);
            }
        }
        Ok(grouped_icons
            .into_iter()
            .map(|(data_url, item_ids)| NativeFileIconGroup { item_ids, data_url })
            .collect())
    })
    .await
    .map_err(|error| format!("File icon worker failed: {error}"))?
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredWindowState {
    monitor_name: Option<String>,
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    #[serde(default)]
    maximized: bool,
}

const DEFAULT_WINDOW_WIDTH_LOGICAL: f64 = 1200.0;
const DEFAULT_WINDOW_HEIGHT_LOGICAL: f64 = 760.0;
const MIN_WINDOW_WIDTH_LOGICAL: f64 = 900.0;
const MIN_WINDOW_HEIGHT_LOGICAL: f64 = 480.0;
const DEFAULT_WINDOW_WORK_AREA_RATIO: f64 = 0.85;

fn window_state_path<R: tauri::Runtime, M: Manager<R>>(app: &M) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("cyberfiles-window.json"))
        .map_err(|error| error.to_string())
}

fn write_window_state(path: &PathBuf, state: &StoredWindowState) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Window state path has no parent directory")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    fs::write(
        path,
        serde_json::to_vec(state).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn default_window_state(
    monitor: &tauri::Monitor,
    frame_width: u32,
    frame_height: u32,
) -> StoredWindowState {
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let work_area = monitor.work_area();
    let (work_position, work_size) = if work_area.size.width > 0 && work_area.size.height > 0 {
        (work_area.position, work_area.size)
    } else {
        (*monitor_position, *monitor_size)
    };
    let scale = monitor.scale_factor();
    let max_default_width = ((work_size.width as f64) * DEFAULT_WINDOW_WORK_AREA_RATIO)
        .round()
        .max(1.0) as u32;
    let max_default_height = ((work_size.height as f64) * DEFAULT_WINDOW_WORK_AREA_RATIO)
        .round()
        .max(1.0) as u32;
    let width = ((DEFAULT_WINDOW_WIDTH_LOGICAL * scale).round() as u32)
        .saturating_add(frame_width)
        .min(max_default_width)
        .min(work_size.width);
    let height = ((DEFAULT_WINDOW_HEIGHT_LOGICAL * scale).round() as u32)
        .saturating_add(frame_height)
        .min(max_default_height)
        .min(work_size.height);

    StoredWindowState {
        monitor_name: monitor.name().cloned(),
        monitor_x: monitor_position.x,
        monitor_y: monitor_position.y,
        monitor_width: monitor_size.width,
        monitor_height: monitor_size.height,
        x: work_position
            .x
            .saturating_add(work_size.width.saturating_sub(width) as i32 / 2),
        y: work_position
            .y
            .saturating_add(work_size.height.saturating_sub(height) as i32 / 2),
        width,
        height,
        maximized: false,
    }
}

fn save_window_state(window: &tauri::WebviewWindow, path: &PathBuf) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window
            .primary_monitor()
            .map_err(|error| error.to_string())?);
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let monitor = monitor.ok_or("No monitor is available to save window state")?;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    let minimized = window.is_minimized().map_err(|error| error.to_string())?;
    let previous_state = fs::read(path)
        .ok()
        .and_then(|encoded| serde_json::from_slice::<StoredWindowState>(&encoded).ok());

    // A maximized window reports the full monitor rectangle as its outer size.
    // Keep its last normal bounds so unmaximizing after relaunch does not restore
    // that oversized rectangle. A minimized window likewise keeps its prior state.
    if let Some(mut state) = previous_state.clone().filter(|_| maximized || minimized) {
        if maximized {
            let offset_x = state.x.saturating_sub(state.monitor_x);
            let offset_y = state.y.saturating_sub(state.monitor_y);
            state.monitor_name = monitor.name().cloned();
            state.monitor_x = monitor_position.x;
            state.monitor_y = monitor_position.y;
            state.monitor_width = monitor_size.width;
            state.monitor_height = monitor_size.height;
            state.x = monitor_position.x.saturating_add(offset_x);
            state.y = monitor_position.y.saturating_add(offset_y);
            state.maximized = true;
        }
        return write_window_state(path, &state);
    }

    let state = if maximized {
        let work_area = monitor.work_area();
        let work_position = work_area.position;
        let work_size = work_area.size;
        let width = 1440.min(work_size.width);
        let height = 900.min(work_size.height);
        StoredWindowState {
            monitor_name: monitor.name().cloned(),
            monitor_x: monitor_position.x,
            monitor_y: monitor_position.y,
            monitor_width: monitor_size.width,
            monitor_height: monitor_size.height,
            x: work_position
                .x
                .saturating_add(work_size.width.saturating_sub(width) as i32 / 2),
            y: work_position
                .y
                .saturating_add(work_size.height.saturating_sub(height) as i32 / 2),
            width,
            height,
            maximized: true,
        }
    } else {
        StoredWindowState {
            monitor_name: monitor.name().cloned(),
            monitor_x: monitor_position.x,
            monitor_y: monitor_position.y,
            monitor_width: monitor_size.width,
            monitor_height: monitor_size.height,
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            maximized: false,
        }
    };
    write_window_state(path, &state)
}

fn restore_window_state(window: &tauri::WebviewWindow, path: &PathBuf) -> Result<(), String> {
    let mut saved_state = fs::read(path)
        .ok()
        .and_then(|encoded| serde_json::from_slice::<StoredWindowState>(&encoded).ok());
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if monitors.is_empty() {
        return Ok(());
    }

    let primary_monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?;
    let monitor = saved_state
        .as_ref()
        .and_then(|state| {
            state.monitor_name.as_ref().and_then(|name| {
                monitors
                    .iter()
                    .find(|monitor| monitor.name().map(String::as_str) == Some(name.as_str()))
                    .cloned()
            })
        })
        .or_else(|| {
            saved_state.as_ref().and_then(|state| {
                monitors
                    .iter()
                    .min_by_key(|monitor| {
                        let position = monitor.position();
                        let size = monitor.size();
                        i64::from(position.x.saturating_sub(state.monitor_x)).abs()
                            + i64::from(position.y.saturating_sub(state.monitor_y)).abs()
                            + i64::from(size.width.abs_diff(state.monitor_width))
                            + i64::from(size.height.abs_diff(state.monitor_height))
                    })
                    .cloned()
            })
        })
        .or(primary_monitor)
        .or_else(|| monitors.first().cloned())
        .ok_or("No monitor is available to restore window state")?;

    let work_area = monitor.work_area();
    let work_position = work_area.position;
    let work_size = work_area.size;
    if work_size.width == 0 || work_size.height == 0 {
        return Ok(());
    }
    let monitor_size = monitor.size();

    // Stored bounds and monitor work areas are physical pixels. Tauri's
    // configured minimum size is in logical pixels, so translate it using the
    // destination monitor's DPI and include the non-client frame.
    let current_scale = window.scale_factor().map_err(|error| error.to_string())?;
    let scale_ratio = monitor.scale_factor() / current_scale.max(f64::EPSILON);
    let current_outer_size = window.outer_size().map_err(|error| error.to_string())?;
    let current_inner_size = window.inner_size().map_err(|error| error.to_string())?;
    let frame_width = (current_outer_size
        .width
        .saturating_sub(current_inner_size.width) as f64
        * scale_ratio)
        .round() as u32;
    let frame_height = (current_outer_size
        .height
        .saturating_sub(current_inner_size.height) as f64
        * scale_ratio)
        .round() as u32;

    if saved_state.is_none() {
        saved_state = Some(default_window_state(&monitor, frame_width, frame_height));
    }
    let mut state = saved_state.expect("window state was initialized above");
    let default_width = ((DEFAULT_WINDOW_WIDTH_LOGICAL * monitor.scale_factor()).round() as u32)
        .saturating_add(frame_width)
        .min(((work_size.width as f64) * DEFAULT_WINDOW_WORK_AREA_RATIO).round() as u32)
        .min(work_size.width);
    let default_height = ((DEFAULT_WINDOW_HEIGHT_LOGICAL * monitor.scale_factor()).round() as u32)
        .saturating_add(frame_height)
        .min(((work_size.height as f64) * DEFAULT_WINDOW_WORK_AREA_RATIO).round() as u32)
        .min(work_size.height);
    let oversized_for_monitor =
        state.width > monitor_size.width || state.height > monitor_size.height;
    let requested_width = if oversized_for_monitor {
        default_width
    } else {
        state.width
    };
    let requested_height = if oversized_for_monitor {
        default_height
    } else {
        state.height
    };
    let minimum_width = (((MIN_WINDOW_WIDTH_LOGICAL * monitor.scale_factor()).round() as u32)
        .saturating_add(frame_width))
    .min(work_size.width)
    .max(1);
    let minimum_height = (((MIN_WINDOW_HEIGHT_LOGICAL * monitor.scale_factor()).round() as u32)
        .saturating_add(frame_height))
    .min(work_size.height)
    .max(1);
    let width = requested_width.clamp(minimum_width, work_size.width);
    let height = requested_height.clamp(minimum_height, work_size.height);
    // Keep the selected monitor and restored dimensions, but center each
    // launch within its work area. This prevents legacy coordinates, often
    // saved across monitors with different DPI, from straddling displays.
    let x = work_position
        .x
        .saturating_add(work_size.width.saturating_sub(width) as i32 / 2);
    let y = work_position
        .y
        .saturating_add(work_size.height.saturating_sub(height) as i32 / 2);

    // Normalize saved bounds even when launching maximized. Older state files
    // could retain an oversized restore rectangle, which Windows would reuse
    // when the user unmaximized the window.
    let monitor_position = monitor.position();
    state.monitor_name = monitor.name().cloned();
    state.monitor_x = monitor_position.x;
    state.monitor_y = monitor_position.y;
    state.monitor_width = monitor_size.width;
    state.monitor_height = monitor_size.height;
    state.x = x;
    state.y = y;
    state.width = width;
    state.height = height;
    state.maximized |= oversized_for_monitor;
    write_window_state(path, &state)?;

    // set_size changes the client area, while stored bounds describe the full
    // decorated window. Convert the desired outer size to its client size.
    let inner_width = width.saturating_sub(frame_width).max(1);
    let inner_height = height.saturating_sub(frame_height).max(1);

    window
        .set_size(PhysicalSize::new(inner_width, inner_height))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn refresh_tray_toggle_label(
    app: &tauri::AppHandle,
    toggle: &MenuItem<tauri::Wry>,
    window: &tauri::WebviewWindow,
) {
    let state = app.state::<TrayMenuState>();
    let english = state.english.lock().map(|value| *value).unwrap_or(false);
    let shortcut_hint = state
        .shortcut_hint
        .lock()
        .map(|value| value.clone())
        .unwrap_or(None);
    let visible = window.is_visible().unwrap_or(true) && !window.is_minimized().unwrap_or(false);
    let label = match (english, visible) {
        (true, true) => "Hide CyberFiles",
        (true, false) => "Show CyberFiles",
        (false, true) => "Ocultar CyberFiles",
        (false, false) => "Mostrar CyberFiles",
    };
    let text = shortcut_hint.map_or_else(|| label.to_string(), |hint| format!("{label}    {hint}"));
    let _ = toggle.set_text(text);
}

fn update_tray_hotkey_hint(app: &tauri::AppHandle, shortcut: Option<&str>) -> Result<(), String> {
    let state = app.state::<TrayMenuState>();
    *state
        .shortcut_hint
        .lock()
        .map_err(|error| error.to_string())? = shortcut.map(str::to_string);

    if let Some(tray) = state
        .tray
        .lock()
        .map_err(|error| error.to_string())?
        .as_ref()
    {
        let tooltip = shortcut.map_or_else(
            || "CyberFiles".to_string(),
            |key| format!("CyberFiles · {key}"),
        );
        let _ = tray.set_tooltip(Some(tooltip));
    }
    if let Some(window) = app.get_webview_window("main") {
        refresh_tray_toggle_label(app, &state.toggle, &window);
    }
    Ok(())
}

fn toggle_main_window(app: &tauri::AppHandle, toggle: &MenuItem<tauri::Wry>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(true) && !window.is_minimized().unwrap_or(false) {
        if let Ok(path) = window_state_path(app) {
            let _ = save_window_state(&window, &path);
        }
        let _ = window.hide();
    } else {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    refresh_tray_toggle_label(app, toggle, &window);
}

#[tauri::command]
fn set_tray_language(language: String, app: tauri::AppHandle) -> Result<(), String> {
    let english = language == "en";
    let state = app.state::<TrayMenuState>();
    *state.english.lock().map_err(|error| error.to_string())? = english;
    if let Some(window) = app.get_webview_window("main") {
        refresh_tray_toggle_label(&app, &state.toggle, &window);
    }
    let _ = state.quit.set_text(if english { "Quit" } else { "Salir" });
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeDrive {
    id: String,
    letter: String,
    label: String,
    total_bytes: u64,
    used_bytes: u64,
    kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeLocation {
    id: String,
    path: String,
}

#[cfg(target_os = "windows")]
fn system_drives() -> Vec<NativeDrive> {
    use windows_sys::Win32::Storage::FileSystem::{
        GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW,
    };

    let mask = unsafe { GetLogicalDrives() };
    let mut drives = Vec::new();

    for index in 0..26 {
        if mask & (1 << index) == 0 {
            continue;
        }
        let letter = format!("{}:", (b'A' + index as u8) as char);
        let root = format!("{letter}\\");
        let root_wide: Vec<u16> = root.encode_utf16().chain(Some(0)).collect();
        let mut total_bytes = 0_u64;
        let mut free_bytes = 0_u64;
        let has_space = unsafe {
            GetDiskFreeSpaceExW(
                root_wide.as_ptr(),
                std::ptr::null_mut(),
                &mut total_bytes,
                &mut free_bytes,
            ) != 0
        };
        let kind = match unsafe { GetDriveTypeW(root_wide.as_ptr()) } {
            2 => "removable",
            4 => "network",
            5 => "optical",
            3 => "fixed",
            _ => "unknown",
        };
        let mut volume_label = [0_u16; 261];
        let has_label = unsafe {
            GetVolumeInformationW(
                root_wide.as_ptr(),
                volume_label.as_mut_ptr(),
                volume_label.len() as u32,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                0,
            ) != 0
        };
        let label = if has_label {
            let length = volume_label
                .iter()
                .position(|character| *character == 0)
                .unwrap_or(volume_label.len());
            let name = String::from_utf16_lossy(&volume_label[..length]);
            if name.trim().is_empty() {
                letter.clone()
            } else {
                name
            }
        } else {
            letter.clone()
        };
        drives.push(NativeDrive {
            id: letter.clone(),
            letter: letter.clone(),
            label,
            total_bytes: if has_space { total_bytes } else { 0 },
            used_bytes: if has_space {
                total_bytes.saturating_sub(free_bytes)
            } else {
                0
            },
            kind: kind.to_string(),
        });
    }
    drives
}

#[cfg(not(target_os = "windows"))]
fn system_drives() -> Vec<NativeDrive> {
    Vec::new()
}

#[tauri::command]
fn list_drives() -> Vec<NativeDrive> {
    system_drives()
}

#[tauri::command]
fn list_system_locations(app: tauri::AppHandle) -> Vec<NativeLocation> {
    let resolver = app.path();
    [
        ("desktop", resolver.desktop_dir()),
        ("documents", resolver.document_dir()),
        ("downloads", resolver.download_dir()),
        ("pictures", resolver.picture_dir()),
        ("music", resolver.audio_dir()),
        ("videos", resolver.video_dir()),
    ]
    .into_iter()
    .filter_map(|(id, path)| {
        path.ok()
            .filter(|path| path.is_dir())
            .map(|path| NativeLocation {
                id: id.to_string(),
                path: path.to_string_lossy().into_owned(),
            })
    })
    .collect()
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct RecycleBinStatus {
    available: bool,
    item_count: u64,
    total_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecycleBinEntry {
    id: String,
    name: String,
    original_path: Option<String>,
    is_folder: bool,
    size: u64,
    deleted_at_ms: Option<u64>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct LoadedRecycleBin {
    entries: Vec<RecycleBinEntry>,
    has_more: bool,
    next_offset: usize,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct RecycleBinRestoreResult {
    restored_ids: Vec<String>,
    failures: Vec<RecycleBinFailure>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecycleBinRestoreRequest {
    id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecycleBinFailure {
    path: String,
    error: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct RecycleBinDeleteResult {
    recycled_paths: Vec<String>,
    failures: Vec<RecycleBinFailure>,
}

#[cfg(target_os = "windows")]
const CLSID_FILE_OPERATION: windows::core::GUID =
    windows::core::GUID::from_u128(0x3ad0557588574850927711b85bdb8e09);

#[cfg(target_os = "windows")]
const RECYCLE_BIN_PAGE_SIZE: usize = 400;

#[cfg(target_os = "windows")]
fn recycle_bin_property_key(name: &str) -> Result<windows::Win32::Foundation::PROPERTYKEY, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::UI::Shell::PropertiesSystem::PSGetPropertyKeyFromName;

    let wide_name: Vec<u16> = std::ffi::OsStr::new(name)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let mut key: PROPERTYKEY = unsafe { std::mem::zeroed() };
    unsafe { PSGetPropertyKeyFromName(PCWSTR(wide_name.as_ptr()), &mut key) }
        .map_err(|error| format!("Could not resolve Windows property {name}: {error}"))?;
    Ok(key)
}

#[cfg(target_os = "windows")]
unsafe fn take_shell_string(value: windows::core::PWSTR) -> Result<String, String> {
    use windows::Win32::System::Com::CoTaskMemFree;

    let pointer = value.0;
    if pointer.is_null() {
        return Err("Windows returned an empty Shell string.".to_string());
    }
    let mut length = 0;
    while unsafe { *pointer.add(length) } != 0 {
        length += 1;
    }
    let text = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(pointer, length) });
    unsafe { CoTaskMemFree(Some(pointer.cast())) };
    Ok(text)
}

#[cfg(target_os = "windows")]
fn filetime_to_unix_millis(filetime: windows::Win32::Foundation::FILETIME) -> Option<u64> {
    const WINDOWS_TO_UNIX_EPOCH_100NS: u64 = 116_444_736_000_000_000;
    let ticks = (u64::from(filetime.dwHighDateTime) << 32) | u64::from(filetime.dwLowDateTime);
    ticks
        .checked_sub(WINDOWS_TO_UNIX_EPOCH_100NS)
        .map(|unix_ticks| unix_ticks / 10_000)
}

#[cfg(target_os = "windows")]
fn list_windows_recycle_bin(offset: usize) -> Result<LoadedRecycleBin, String> {
    use windows::core::{w, Interface};
    use windows::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, IBindCtx, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::SystemServices::SFGAO_FOLDER;
    use windows::Win32::UI::Shell::{
        BHID_EnumItems, IEnumShellItems, IShellItem, IShellItem2, SHCreateItemFromParsingName,
        SIGDN_DESKTOPABSOLUTEPARSING,
    };

    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let recycle_bin: IShellItem =
        unsafe { SHCreateItemFromParsingName(w!("shell:RecycleBinFolder"), None::<&IBindCtx>) }
            .map_err(|error| {
                format!("Could not open the Windows Recycle Bin namespace: {error}")
            })?;
    let enumeration: IEnumShellItems = unsafe {
        recycle_bin.BindToHandler::<_, IEnumShellItems>(None::<&IBindCtx>, &BHID_EnumItems)
    }
    .map_err(|error| format!("Could not enumerate Windows Recycle Bin items: {error}"))?;

    let name_key = recycle_bin_property_key("System.ItemNameDisplay")?;
    let original_location_key = recycle_bin_property_key("System.Recycle.DeletedFrom")?;
    let size_key = recycle_bin_property_key("System.Size")?;
    let deleted_date_key = recycle_bin_property_key("System.Recycle.DateDeleted")?;
    let mut result = LoadedRecycleBin::default();
    let mut skipped = 0_usize;

    loop {
        let mut fetched = 0_u32;
        let mut next_item: [Option<IShellItem>; 1] = [None];
        unsafe { enumeration.Next(&mut next_item, Some(&mut fetched)) }
            .map_err(|error| format!("Could not read Recycle Bin entries: {error}"))?;
        if fetched == 0 {
            break;
        }
        if skipped < offset {
            skipped += 1;
            continue;
        }
        if result.entries.len() == RECYCLE_BIN_PAGE_SIZE {
            result.has_more = true;
            break;
        }

        let shell_item = next_item[0]
            .take()
            .ok_or_else(|| "Windows returned an empty Recycle Bin entry.".to_string())?;
        let shell_item2: IShellItem2 = shell_item
            .cast()
            .map_err(|error| format!("Could not inspect a Recycle Bin entry: {error}"))?;

        let name = unsafe { shell_item2.GetString(&name_key) }
            .map_err(|error| format!("Could not read a Recycle Bin item name: {error}"))?;
        let name = unsafe { take_shell_string(name) }?;
        let parsing_name = unsafe { shell_item2.GetDisplayName(SIGDN_DESKTOPABSOLUTEPARSING) }
            .map_err(|error| format!("Could not identify a Recycle Bin item: {error}"))?;
        let id = unsafe { take_shell_string(parsing_name) }?;
        let original_location = unsafe { shell_item2.GetString(&original_location_key) }
            .ok()
            .and_then(|value| unsafe { take_shell_string(value) }.ok());
        let original_path = original_location.map(|location| {
            Path::new(&location)
                .join(&name)
                .to_string_lossy()
                .into_owned()
        });
        let is_folder = unsafe { shell_item2.GetAttributes(SFGAO_FOLDER) }
            .map(|attributes| attributes.0 & SFGAO_FOLDER.0 != 0)
            .unwrap_or(false);
        let size = unsafe { shell_item2.GetUInt64(&size_key) }.unwrap_or(0);
        let deleted_at_ms = unsafe { shell_item2.GetFileTime(&deleted_date_key) }
            .ok()
            .and_then(filetime_to_unix_millis);

        result.entries.push(RecycleBinEntry {
            id,
            name,
            original_path,
            is_folder,
            size,
            deleted_at_ms,
        });
    }

    result.next_offset = offset + result.entries.len();
    Ok(result)
}

#[cfg(not(target_os = "windows"))]
fn list_windows_recycle_bin(_offset: usize) -> Result<LoadedRecycleBin, String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

#[cfg(target_os = "windows")]
fn restore_windows_recycle_bin_item(id: &str) -> Result<(), String> {
    use windows::core::{w, Interface, PCSTR};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{
        CoInitializeEx, CoTaskMemFree, CoUninitialize, IBindCtx, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        BHID_EnumItems, Common::ITEMIDLIST, IContextMenu, IEnumShellItems, IShellFolder,
        IShellItem, IShellItem2, SHBindToParent, SHCreateItemFromParsingName,
        SHGetIDListFromObject, CMF_NORMAL, CMINVOKECOMMANDINFO, SIGDN_DESKTOPABSOLUTEPARSING,
    };
    use windows::Win32::UI::WindowsAndMessaging::{CreatePopupMenu, DestroyMenu};

    if id.trim().is_empty() || id.len() > 32_768 {
        return Err("The selected Recycle Bin item identifier is invalid.".to_string());
    }

    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let recycle_bin: IShellItem =
        unsafe { SHCreateItemFromParsingName(w!("shell:RecycleBinFolder"), None::<&IBindCtx>) }
            .map_err(|error| format!("Could not open the Windows Recycle Bin: {error}"))?;
    let enumeration: IEnumShellItems = unsafe {
        recycle_bin.BindToHandler::<_, IEnumShellItems>(None::<&IBindCtx>, &BHID_EnumItems)
    }
    .map_err(|error| format!("Could not enumerate Windows Recycle Bin items: {error}"))?;
    let mut source: Option<IShellItem> = None;
    loop {
        let mut fetched = 0_u32;
        let mut next_item: [Option<IShellItem>; 1] = [None];
        unsafe { enumeration.Next(&mut next_item, Some(&mut fetched)) }
            .map_err(|error| format!("Could not read Recycle Bin entries: {error}"))?;
        if fetched == 0 {
            break;
        }
        let candidate = next_item[0]
            .take()
            .ok_or_else(|| "Windows returned an empty Recycle Bin entry.".to_string())?;
        let candidate_id = unsafe { candidate.GetDisplayName(SIGDN_DESKTOPABSOLUTEPARSING) }
            .map_err(|error| format!("Could not identify a Recycle Bin item: {error}"))?;
        let candidate_id = unsafe { take_shell_string(candidate_id) }?;
        if candidate_id.eq_ignore_ascii_case(id) {
            source = Some(candidate);
            break;
        }
    }
    let source =
        source.ok_or_else(|| "The Recycle Bin item is no longer available.".to_string())?;
    let source_metadata: IShellItem2 = source
        .cast()
        .map_err(|error| format!("Could not inspect the Recycle Bin item: {error}"))?;
    let original_location_key = recycle_bin_property_key("System.Recycle.DeletedFrom")?;
    let name_key = recycle_bin_property_key("System.ItemNameDisplay")?;
    let original_location = unsafe { source_metadata.GetString(&original_location_key) }
        .map_err(|error| format!("The original folder could not be read: {error}"))?;
    let original_location = unsafe { take_shell_string(original_location) }?;
    let item_name = unsafe { source_metadata.GetString(&name_key) }
        .map_err(|error| format!("The original item name could not be read: {error}"))?;
    let item_name = unsafe { take_shell_string(item_name) }?;
    let destination = Path::new(&original_location).join(&item_name);
    validate_recycle_source(&destination)?;
    if destination.exists() {
        return Err("The original location already contains an item with that name.".to_string());
    }
    if !destination.parent().is_some_and(|path| path.is_dir()) {
        return Err("The original folder is no longer available.".to_string());
    }
    let absolute_pidl = unsafe { SHGetIDListFromObject(&source) }.map_err(|error| {
        format!("Could not identify the Recycle Bin item for restoration: {error}")
    })?;
    if absolute_pidl.is_null() {
        return Err("Windows returned an empty Recycle Bin item identifier.".to_string());
    }
    struct OwnedItemIdList(*mut ITEMIDLIST);
    impl Drop for OwnedItemIdList {
        fn drop(&mut self) {
            unsafe { CoTaskMemFree(Some(self.0.cast())) };
        }
    }
    let absolute_pidl = OwnedItemIdList(absolute_pidl);
    let mut child_pidl: *mut ITEMIDLIST = std::ptr::null_mut();
    let parent_folder: IShellFolder =
        unsafe { SHBindToParent(absolute_pidl.0.cast_const(), Some(&mut child_pidl)) }
            .map_err(|error| format!("Could not locate the Recycle Bin item parent: {error}"))?;
    if child_pidl.is_null() {
        return Err("Windows returned an empty Recycle Bin child identifier.".to_string());
    }
    let context_menu: IContextMenu =
        unsafe { parent_folder.GetUIObjectOf(HWND::default(), &[child_pidl.cast_const()], None) }
            .map_err(|error| format!("Could not access the Windows restore command: {error}"))?;
    let menu = unsafe { CreatePopupMenu() }
        .map_err(|error| format!("Could not prepare the Windows restore command: {error}"))?;
    let invoke_result = unsafe {
        let query_result = context_menu.QueryContextMenu(menu, 0, 1, 0x7fff, CMF_NORMAL);
        if query_result.is_err() {
            Err(format!(
                "Could not load the Windows restore command: {query_result}"
            ))
        } else {
            let mut command = CMINVOKECOMMANDINFO::default();
            command.cbSize = std::mem::size_of::<CMINVOKECOMMANDINFO>() as u32;
            command.lpVerb = PCSTR(b"undelete\0".as_ptr());
            command.nShow = 1;
            context_menu
                .InvokeCommand(&command)
                .map_err(|error| format!("Windows could not restore the item: {error}"))
        }
    };
    unsafe {
        let _ = DestroyMenu(menu);
    }
    invoke_result?;
    if !destination.exists() {
        return Err("Windows reported success, but the item was not restored.".to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn restore_windows_recycle_bin_item(_id: &str) -> Result<(), String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

#[cfg(target_os = "windows")]
fn query_windows_recycle_bin() -> Result<RecycleBinStatus, String> {
    use windows_sys::Win32::UI::Shell::{SHQueryRecycleBinW, SHQUERYRBINFO};

    let mut info = SHQUERYRBINFO {
        cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32,
        ..Default::default()
    };
    let result = unsafe { SHQueryRecycleBinW(std::ptr::null(), &mut info) };
    if result < 0 {
        return Err(format!(
            "Windows could not query Recycle Bin status (HRESULT 0x{:08X}).",
            result as u32
        ));
    }

    Ok(RecycleBinStatus {
        available: true,
        item_count: info.i64NumItems.max(0) as u64,
        total_bytes: info.i64Size.max(0) as u64,
    })
}

#[cfg(not(target_os = "windows"))]
fn query_windows_recycle_bin() -> Result<RecycleBinStatus, String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

fn validate_recycle_source(source: &Path) -> Result<(), String> {
    if !source.is_absolute() {
        return Err("Only fully qualified paths can be sent to the Recycle Bin.".to_string());
    }
    if source.components().any(|component| {
        matches!(
            component,
            std::path::Component::Prefix(prefix)
                if matches!(
                    prefix.kind(),
                    std::path::Prefix::UNC(..) | std::path::Prefix::VerbatimUNC(..)
                )
        )
    }) {
        return Err("Network shares cannot be safely sent to the Windows Recycle Bin.".to_string());
    }
    let mut depth = 0_i64;
    for component in source.components() {
        match component {
            std::path::Component::Normal(_) => depth += 1,
            std::path::Component::ParentDir => depth -= 1,
            _ => {}
        }
        if depth < 0 {
            return Err("The path traverses above a filesystem root.".to_string());
        }
    }
    if depth == 0 {
        return Err("A filesystem root cannot be sent to the Recycle Bin.".to_string());
    }
    Ok(())
}

#[tauri::command]
async fn get_recycle_bin_status() -> Result<RecycleBinStatus, String> {
    tauri::async_runtime::spawn_blocking(query_windows_recycle_bin)
        .await
        .map_err(|error| format!("Recycle Bin status worker failed: {error}"))?
}

#[tauri::command]
async fn list_recycle_bin(offset: usize) -> Result<LoadedRecycleBin, String> {
    tauri::async_runtime::spawn_blocking(move || list_windows_recycle_bin(offset))
        .await
        .map_err(|error| format!("Recycle Bin listing worker failed: {error}"))?
}

#[tauri::command]
async fn restore_recycle_bin_items(
    items: Vec<RecycleBinRestoreRequest>,
) -> Result<RecycleBinRestoreResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut result = RecycleBinRestoreResult::default();
        let mut seen = std::collections::HashSet::new();
        for item in items {
            if !seen.insert(item.id.clone()) {
                continue;
            }
            match restore_windows_recycle_bin_item(&item.id) {
                Ok(()) => result.restored_ids.push(item.id),
                Err(error) => {
                    eprintln!("CyberFiles Recycle Bin restore failed: {error}");
                    result.failures.push(RecycleBinFailure {
                        path: item.id,
                        error,
                    });
                }
            }
        }
        Ok(result)
    })
    .await
    .map_err(|error| format!("Recycle Bin restore worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn recycle_path(path: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{IUnknown, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IBindCtx, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        IFileOperation, IFileOperationProgressSink, IShellItem, SHCreateItemFromParsingName,
        FOFX_RECYCLEONDELETE, FOF_NO_UI,
    };

    let source = Path::new(path);
    validate_recycle_source(source)?;
    let metadata = fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Symbolic links are not supported for Recycle Bin operations.".to_string());
    }

    let resolved = source.canonicalize().map_err(|error| error.to_string())?;
    validate_recycle_source(&resolved)?;
    let shell_path = display_path(&resolved);
    let path_bytes = shell_path.as_bytes();
    if path_bytes.len() < 3 || path_bytes[1] != b':' || path_bytes[2] != b'\\' {
        return Err(
            "Only local drive-letter paths can be safely sent to the Recycle Bin.".to_string(),
        );
    }
    let root = format!("{}:\\", path_bytes[0] as char);
    let root_wide: Vec<u16> = root.encode_utf16().chain(Some(0)).collect();
    let drive_type =
        unsafe { windows_sys::Win32::Storage::FileSystem::GetDriveTypeW(root_wide.as_ptr()) };
    if drive_type != windows_sys::Win32::System::WindowsProgramming::DRIVE_FIXED
        && drive_type != windows_sys::Win32::System::WindowsProgramming::DRIVE_REMOVABLE
    {
        return Err(
            "This drive type cannot be safely sent to the Windows Recycle Bin.".to_string(),
        );
    }

    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let wide_path: Vec<u16> = std::ffi::OsStr::new(&shell_path)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let shell_item: IShellItem =
        unsafe { SHCreateItemFromParsingName(PCWSTR(wide_path.as_ptr()), None::<&IBindCtx>) }
            .map_err(|error| format!("Could not open the selected Shell item: {error}"))?;
    let operation: IFileOperation = unsafe {
        CoCreateInstance(
            &CLSID_FILE_OPERATION,
            None::<&IUnknown>,
            CLSCTX_INPROC_SERVER,
        )
    }
    .map_err(|error| format!("Could not start the Windows file operation: {error}"))?;
    unsafe {
        operation
            .SetOperationFlags(FOF_NO_UI | FOFX_RECYCLEONDELETE)
            .map_err(|error| format!("Could not configure Recycle Bin deletion: {error}"))?;
        operation
            .DeleteItem(&shell_item, None::<&IFileOperationProgressSink>)
            .map_err(|error| format!("Could not queue Recycle Bin deletion: {error}"))?;
        operation.PerformOperations().map_err(|error| {
            format!("Windows could not move the item to the Recycle Bin: {error}")
        })?;
        if operation
            .GetAnyOperationsAborted()
            .map_err(|error| format!("Could not verify the Recycle Bin operation: {error}"))?
            .as_bool()
        {
            return Err("Windows aborted the Recycle Bin operation.".to_string());
        }
    }
    if resolved.exists() {
        return Err("Windows reported success but the selected item still exists.".to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn recycle_path(_path: &str) -> Result<(), String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

#[cfg(target_os = "windows")]
fn recycle_paths(paths: Vec<String>) -> RecycleBinDeleteResult {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{IUnknown, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IBindCtx, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        IFileOperation, IFileOperationProgressSink, IShellItem, SHCreateItemFromParsingName,
        FOFX_RECYCLEONDELETE, FOF_NO_UI,
    };

    if paths.len() == 1 {
        let path = &paths[0];
        return match recycle_path(path) {
            Ok(()) => RecycleBinDeleteResult {
                recycled_paths: vec![path.clone()],
                failures: Vec::new(),
            },
            Err(error) => RecycleBinDeleteResult {
                recycled_paths: Vec::new(),
                failures: vec![RecycleBinFailure {
                    path: path.clone(),
                    error,
                }],
            },
        };
    }

    let mut result = RecycleBinDeleteResult::default();
    let mut seen = std::collections::HashSet::new();
    let mut candidates = Vec::new();
    for path in paths {
        if !seen.insert(path.replace('/', "\\").to_lowercase()) {
            continue;
        }
        let source = Path::new(&path);
        let prepared = (|| -> Result<(PathBuf, String), String> {
            validate_recycle_source(source)?;
            let metadata = fs::symlink_metadata(source).map_err(|error| error.to_string())?;
            if metadata.file_type().is_symlink() {
                return Err(
                    "Symbolic links are not supported for Recycle Bin operations.".to_string(),
                );
            }
            let resolved = source.canonicalize().map_err(|error| error.to_string())?;
            validate_recycle_source(&resolved)?;
            let shell_path = display_path(&resolved);
            let path_bytes = shell_path.as_bytes();
            if path_bytes.len() < 3 || path_bytes[1] != b':' || path_bytes[2] != b'\\' {
                return Err(
                    "Only local drive-letter paths can be safely sent to the Recycle Bin."
                        .to_string(),
                );
            }
            let root = format!("{}:\\", path_bytes[0] as char);
            let root_wide: Vec<u16> = root.encode_utf16().chain(Some(0)).collect();
            let drive_type = unsafe {
                windows_sys::Win32::Storage::FileSystem::GetDriveTypeW(root_wide.as_ptr())
            };
            if drive_type != windows_sys::Win32::System::WindowsProgramming::DRIVE_FIXED
                && drive_type != windows_sys::Win32::System::WindowsProgramming::DRIVE_REMOVABLE
            {
                return Err(
                    "This drive type cannot be safely sent to the Windows Recycle Bin.".to_string(),
                );
            }
            Ok((resolved, shell_path))
        })();
        match prepared {
            Ok((resolved, shell_path)) => candidates.push((path, resolved, shell_path)),
            Err(error) => result.failures.push(RecycleBinFailure { path, error }),
        }
    }
    if candidates.is_empty() {
        return result;
    }

    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        let error = format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        );
        result.failures.extend(
            candidates
                .into_iter()
                .map(|(path, _, _)| RecycleBinFailure {
                    path,
                    error: error.clone(),
                }),
        );
        return result;
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let operation: IFileOperation = match unsafe {
        CoCreateInstance(
            &CLSID_FILE_OPERATION,
            None::<&IUnknown>,
            CLSCTX_INPROC_SERVER,
        )
    } {
        Ok(operation) => operation,
        Err(error) => {
            let message = format!("Could not start the Windows file operation: {error}");
            result.failures.extend(
                candidates
                    .into_iter()
                    .map(|(path, _, _)| RecycleBinFailure {
                        path,
                        error: message.clone(),
                    }),
            );
            return result;
        }
    };
    if let Err(error) = unsafe { operation.SetOperationFlags(FOF_NO_UI | FOFX_RECYCLEONDELETE) } {
        let message = format!("Could not configure Recycle Bin deletion: {error}");
        result.failures.extend(
            candidates
                .into_iter()
                .map(|(path, _, _)| RecycleBinFailure {
                    path,
                    error: message.clone(),
                }),
        );
        return result;
    }

    let mut queued = Vec::new();
    for (path, resolved, shell_path) in candidates {
        let wide_path: Vec<u16> = std::ffi::OsStr::new(&shell_path)
            .encode_wide()
            .chain(Some(0))
            .collect();
        let shell_item: IShellItem = match unsafe {
            SHCreateItemFromParsingName(PCWSTR(wide_path.as_ptr()), None::<&IBindCtx>)
        } {
            Ok(item) => item,
            Err(error) => {
                result.failures.push(RecycleBinFailure {
                    path,
                    error: format!("Could not open the selected Shell item: {error}"),
                });
                continue;
            }
        };
        match unsafe { operation.DeleteItem(&shell_item, None::<&IFileOperationProgressSink>) } {
            Ok(()) => queued.push((path, resolved)),
            Err(error) => result.failures.push(RecycleBinFailure {
                path,
                error: format!("Could not queue Recycle Bin deletion: {error}"),
            }),
        }
    }
    if queued.is_empty() {
        return result;
    }

    let operation_error = unsafe { operation.PerformOperations() }
        .err()
        .map(|error| format!("Windows could not move the item to the Recycle Bin: {error}"));
    let aborted = match unsafe { operation.GetAnyOperationsAborted() } {
        Ok(value) => value.as_bool(),
        Err(error) => {
            let message = format!("Could not verify the Recycle Bin operation: {error}");
            for (path, resolved) in queued {
                if resolved.exists() {
                    result.failures.push(RecycleBinFailure {
                        path,
                        error: message.clone(),
                    });
                } else {
                    result.recycled_paths.push(path);
                }
            }
            return result;
        }
    };
    for (path, resolved) in queued {
        if !resolved.exists() {
            result.recycled_paths.push(path);
        } else {
            let error = operation_error.clone().unwrap_or_else(|| {
                if aborted {
                    "Windows aborted the Recycle Bin operation.".to_string()
                } else {
                    "Windows reported success but the selected item still exists.".to_string()
                }
            });
            result.failures.push(RecycleBinFailure { path, error });
        }
    }
    result
}

#[cfg(not(target_os = "windows"))]
fn recycle_paths(paths: Vec<String>) -> RecycleBinDeleteResult {
    RecycleBinDeleteResult {
        recycled_paths: Vec::new(),
        failures: paths
            .into_iter()
            .map(|path| RecycleBinFailure {
                path,
                error: "The Windows Recycle Bin is available only in the Windows desktop app."
                    .to_string(),
            })
            .collect(),
    }
}

#[tauri::command]
async fn move_to_recycle_bin(paths: Vec<String>) -> Result<RecycleBinDeleteResult, String> {
    Ok(
        tauri::async_runtime::spawn_blocking(move || recycle_paths(paths))
            .await
            .map_err(|error| format!("Recycle Bin worker failed: {error}"))?,
    )
}

fn validate_permanent_delete_source(source: &Path) -> Result<(), String> {
    if !source.is_absolute() {
        return Err("Only fully qualified paths can be permanently deleted.".to_string());
    }
    if source.components().any(|component| {
        matches!(
            component,
            std::path::Component::Prefix(prefix)
                if matches!(
                    prefix.kind(),
                    std::path::Prefix::UNC(..) | std::path::Prefix::VerbatimUNC(..)
                )
        )
    }) {
        return Err("Network shares cannot be permanently deleted through this operation.".to_string());
    }
    let mut depth = 0_i64;
    for component in source.components() {
        match component {
            std::path::Component::Normal(_) => depth += 1,
            std::path::Component::ParentDir => depth -= 1,
            _ => {}
        }
        if depth < 0 {
            return Err("The path traverses above a filesystem root.".to_string());
        }
    }
    if depth == 0 {
        return Err("A filesystem root cannot be permanently deleted.".to_string());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn permanently_delete_path(path: &str) -> Result<(), String> {
    let source = Path::new(path);
    validate_permanent_delete_source(source)?;
    let metadata = fs::symlink_metadata(source).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Symbolic links cannot be permanently deleted through this operation.".to_string());
    }

    let resolved = source.canonicalize().map_err(|error| error.to_string())?;
    validate_permanent_delete_source(&resolved)?;
    remove_path_without_following_links(&resolved)?;
    if resolved.exists() {
        return Err("The selected item still exists after deletion.".to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn permanently_delete_path(_path: &str) -> Result<(), String> {
    Err("Permanent deletion is available only in the Windows desktop app.".to_string())
}

fn permanently_delete_paths(paths: Vec<String>) -> NativeOperationResult {
    let mut result = NativeOperationResult {
        completed_paths: Vec::new(),
        failures: Vec::new(),
    };
    let mut seen = std::collections::HashSet::new();
    for path in paths {
        if !seen.insert(path.to_lowercase()) {
            continue;
        }
        match permanently_delete_path(&path) {
            Ok(()) => result.completed_paths.push(path),
            Err(error) => result.failures.push(NativeOperationFailure { path, error }),
        }
    }
    result
}

#[tauri::command]
async fn permanently_delete_items(paths: Vec<String>) -> Result<NativeOperationResult, String> {
    tauri::async_runtime::spawn_blocking(move || permanently_delete_paths(paths))
        .await
        .map_err(|error| format!("Permanent deletion worker failed: {error}"))
}
#[cfg(target_os = "windows")]
fn empty_windows_recycle_bin() -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::{
        SHEmptyRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND,
    };

    let result = unsafe {
        SHEmptyRecycleBinW(
            std::ptr::null_mut(),
            std::ptr::null(),
            SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND,
        )
    };
    if result < 0 {
        return Err(format!(
            "Windows could not empty the Recycle Bin (HRESULT 0x{:08X}).",
            result as u32
        ));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn empty_windows_recycle_bin() -> Result<(), String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn empty_recycle_bin() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(empty_windows_recycle_bin)
        .await
        .map_err(|error| format!("Recycle Bin worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn show_windows_file_properties(path: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{SHObjectProperties, SHOP_FILEPATH};

    let item_path = Path::new(path);
    if !item_path.is_absolute() {
        return Err("Windows Properties requires a fully qualified filesystem path.".to_string());
    }
    if !item_path.exists() {
        return Err("The selected item no longer exists.".to_string());
    }

    let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let wide_path: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let opened = unsafe {
        SHObjectProperties(
            None,
            SHOP_FILEPATH,
            PCWSTR(wide_path.as_ptr()),
            PCWSTR::null(),
        )
    };
    if opened.as_bool() {
        Ok(())
    } else {
        Err("Windows could not open the selected item's Properties dialog.".to_string())
    }
}

#[cfg(not(target_os = "windows"))]
fn show_windows_file_properties(_path: &str) -> Result<(), String> {
    Err("Windows Properties is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn open_windows_file_properties(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || show_windows_file_properties(&path))
        .await
        .map_err(|error| format!("Windows Properties worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn open_file_using_windows_default_app(path: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
    };
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let source = Path::new(path);
    if !source.is_absolute() {
        return Err("Only fully qualified file paths can be opened.".to_string());
    }
    let resolved = source
        .canonicalize()
        .map_err(|error| format!("Could not resolve the selected file: {error}"))?;
    if !resolved.is_file() {
        return Err("The selected file is no longer available.".to_string());
    }
    let initialized =
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
    if initialized.is_err() {
        return Err(format!(
            "Could not initialize the Windows Shell apartment (HRESULT 0x{:08X}).",
            initialized.0 as u32
        ));
    }
    struct ComApartment;
    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }
    let _apartment = ComApartment;

    let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let wide_path: Vec<u16> = resolved.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(wide_path.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    let result_code = result.0 as isize;
    if result_code > 32 {
        Ok(())
    } else {
        Err(format!(
            "Windows could not open the file with its default app (ShellExecute error {result_code})."
        ))
    }
}

#[cfg(not(target_os = "windows"))]
fn open_file_using_windows_default_app(_path: &str) -> Result<(), String> {
    Err(
        "Opening files with a Windows default app is available only in the Windows desktop app."
            .to_string(),
    )
}

#[tauri::command]
async fn open_file_with_default_app(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_file_using_windows_default_app(&path))
        .await
        .map_err(|error| format!("Windows file-open worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn launch_recycle_bin_in_explorer() -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .arg("shell:RecycleBinFolder")
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the Windows Recycle Bin: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn launch_recycle_bin_in_explorer() -> Result<(), String> {
    Err("The Windows Recycle Bin is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn open_recycle_bin_in_explorer() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(launch_recycle_bin_in_explorer)
        .await
        .map_err(|error| format!("Recycle Bin launch worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn reveal_folder_in_explorer(path: &str) -> Result<(), String> {
    let folder = Path::new(path)
        .canonicalize()
        .map_err(|error| format!("Could not resolve the folder: {error}"))?;
    if !folder.is_dir() {
        return Err("The selected location is not an available folder.".to_string());
    }
    std::process::Command::new("explorer.exe")
        .arg(&folder)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open Windows File Explorer: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn reveal_folder_in_explorer(_path: &str) -> Result<(), String> {
    Err("Windows File Explorer is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn open_folder_in_windows_explorer(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || reveal_folder_in_explorer(&path))
        .await
        .map_err(|error| format!("Explorer launch worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn launch_terminal_in_folder(path: &str, terminal: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let folder = Path::new(path)
        .canonicalize()
        .map_err(|error| format!("Could not resolve the current folder: {error}"))?;
    if !folder.is_dir() {
        return Err("The active location is not an available folder.".to_string());
    }
    let (executable, elevated) = match terminal {
        "cmd" => ("cmd.exe", false),
        "cmd-admin" => ("cmd.exe", true),
        "powershell" => ("powershell.exe", false),
        "powershell-admin" => ("powershell.exe", true),
        _ => return Err("The selected terminal option is invalid.".to_string()),
    };

    if elevated {
        let verb: Vec<u16> = "runas".encode_utf16().chain(Some(0)).collect();
        let executable_wide: Vec<u16> = executable.encode_utf16().chain(Some(0)).collect();
        let folder_wide: Vec<u16> = folder.as_os_str().encode_wide().chain(Some(0)).collect();
        let result = unsafe {
            ShellExecuteW(
                None,
                PCWSTR(verb.as_ptr()),
                PCWSTR(executable_wide.as_ptr()),
                PCWSTR::null(),
                PCWSTR(folder_wide.as_ptr()),
                SW_SHOWNORMAL,
            )
        };
        let result_code = result.0 as isize;
        if result_code > 32 {
            return Ok(());
        }
        return Err(format!(
            "Windows could not start the elevated terminal (ShellExecute error {result_code})."
        ));
    }

    use std::os::windows::process::CommandExt;
    std::process::Command::new(executable)
        .current_dir(folder)
        .creation_flags(0x00000010)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the terminal here: {error}"))
}

#[cfg(not(target_os = "windows"))]
fn launch_terminal_in_folder(_path: &str, _terminal: &str) -> Result<(), String> {
    Err("Windows terminals are available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn open_terminal_here(path: String, terminal: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || launch_terminal_in_folder(&path, &terminal))
        .await
        .map_err(|error| format!("Terminal launch worker failed: {error}"))?
}

#[cfg(target_os = "windows")]
fn list_windows_special_folders_native() -> Vec<WindowsSpecialFolder> {
    let windows_dir = std::env::var_os("WINDIR")
        .or_else(|| std::env::var_os("SystemRoot"))
        .map(PathBuf::from);
    let app_data = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .or_else(|| {
            std::env::var_os("USERPROFILE").map(|path| PathBuf::from(path).join("AppData"))
        });
    let mut candidates: Vec<(&str, Option<PathBuf>)> = vec![
        (
            "programFilesX86",
            std::env::var_os("ProgramFiles(x86)").map(PathBuf::from),
        ),
        (
            "programFiles",
            std::env::var_os("ProgramW6432")
                .or_else(|| std::env::var_os("ProgramFiles"))
                .map(PathBuf::from),
        ),
        ("appData", app_data),
        (
            "programData",
            std::env::var_os("ProgramData").map(PathBuf::from),
        ),
        (
            "system32",
            windows_dir.as_ref().map(|path| path.join("System32")),
        ),
        ("windows", windows_dir.clone()),
    ];
    let mut folders = Vec::new();
    for (id, path) in candidates.drain(..) {
        let Some(path) = path.filter(|path| path.is_dir()) else {
            continue;
        };
        let display = display_path(&path);
        if folders
            .iter()
            .any(|folder: &WindowsSpecialFolder| folder.path.eq_ignore_ascii_case(&display))
        {
            continue;
        }
        folders.push(WindowsSpecialFolder {
            id: id.to_string(),
            path: display,
            is_file: false,
        });
    }
    if let Some(hosts) = windows_dir
        .map(|path| {
            path.join("System32")
                .join("drivers")
                .join("etc")
                .join("hosts")
        })
        .filter(|path| path.is_file())
    {
        folders.push(WindowsSpecialFolder {
            id: "editHosts".to_string(),
            path: display_path(&hosts),
            is_file: true,
        });
    }
    folders
}

#[cfg(not(target_os = "windows"))]
fn list_windows_special_folders_native() -> Vec<WindowsSpecialFolder> {
    Vec::new()
}

#[tauri::command]
async fn list_windows_special_folders() -> Result<Vec<WindowsSpecialFolder>, String> {
    tauri::async_runtime::spawn_blocking(list_windows_special_folders_native)
        .await
        .map_err(|error| format!("Windows locations worker failed: {error}"))
}

#[cfg(target_os = "windows")]
fn edit_windows_hosts_file() -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let windows_dir = std::env::var_os("WINDIR")
        .or_else(|| std::env::var_os("SystemRoot"))
        .map(PathBuf::from)
        .ok_or_else(|| "Could not find the Windows folder.".to_string())?;
    let hosts = windows_dir
        .join("System32")
        .join("drivers")
        .join("etc")
        .join("hosts");
    if !hosts.is_file() {
        return Err("The Windows hosts file is not available.".to_string());
    }
    let verb: Vec<u16> = "runas".encode_utf16().chain(Some(0)).collect();
    let executable: Vec<u16> = "notepad.exe".encode_utf16().chain(Some(0)).collect();
    let arguments: Vec<u16> = format!("\"{}\"", hosts.to_string_lossy())
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let working_dir: Vec<u16> = hosts
        .parent()
        .unwrap_or(&windows_dir)
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(executable.as_ptr()),
            PCWSTR(arguments.as_ptr()),
            PCWSTR(working_dir.as_ptr()),
            SW_SHOWNORMAL,
        )
    };
    let result_code = result.0 as isize;
    if result_code > 32 {
        Ok(())
    } else {
        Err(format!("Windows could not open the hosts file as administrator (ShellExecute error {result_code})."))
    }
}

#[cfg(not(target_os = "windows"))]
fn edit_windows_hosts_file() -> Result<(), String> {
    Err("Editing the Windows hosts file is available only in the Windows desktop app.".to_string())
}

#[tauri::command]
async fn edit_hosts_file() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(edit_windows_hosts_file)
        .await
        .map_err(|error| format!("Hosts file worker failed: {error}"))?
}

fn main() {
    #[cfg(target_os = "windows")]
    let _single_instance_guard = {
        let preferences_path = startup_instance_preferences_path()
            .expect("Could not locate CyberFiles instance preferences");
        let preferences = load_instance_preferences(&preferences_path);
        if preferences.allow_multiple_instances {
            None
        } else {
            let guard = acquire_single_instance_guard()
                .expect("Could not enforce CyberFiles single-instance mode");
            if guard.is_none() {
                return;
            }
            guard
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let toggle = app.state::<TrayMenuState>().toggle.clone();
                        toggle_main_window(app, &toggle);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let instance_config_path = instance_preferences_config_path(app)?;
            let instance_preferences = load_instance_preferences(&instance_config_path);
            app.manage(InstancePreferencesState {
                preferences: Mutex::new(instance_preferences),
                config_path: instance_config_path,
            });

            let shortcut_config_path = global_shortcut_config_path(app)?;
            let shortcut_preferences = load_global_shortcut_preferences(&shortcut_config_path);
            app.manage(GlobalShortcutState {
                preferences: Mutex::new(shortcut_preferences.clone()),
                registered: Mutex::new(None),
                config_path: shortcut_config_path,
            });

            let toggle =
                MenuItem::with_id(app, "toggle", "Ocultar CyberFiles", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            app.manage(TrayMenuState {
                toggle: toggle.clone(),
                quit: quit.clone(),
                english: Mutex::new(false),
                shortcut_hint: Mutex::new(None),
                tray: Mutex::new(None),
            });
            let menu = Menu::with_items(app, &[&toggle, &quit])?;
            let tray_toggle = toggle.clone();
            let click_toggle = toggle.clone();

            let tray_icon = TrayIconBuilder::with_id("cyberfiles-tray")
                .icon(
                    app.default_window_icon()
                        .ok_or("CyberFiles tray icon is missing")?
                        .clone(),
                )
                .tooltip("CyberFiles")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "toggle" => toggle_main_window(app, &tray_toggle),
                    "quit" => {
                        let _ = app.emit("tray-quit-requested", ());
                    }
                    _ => {}
                })
                .on_tray_icon_event(move |tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => toggle_main_window(tray.app_handle(), &click_toggle),
                    TrayIconEvent::Click {
                        button: MouseButton::Right,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            refresh_tray_toggle_label(app, &click_toggle, &window);
                        }
                    }
                    _ => {}
                })
                .build(app)?;
            if let Ok(mut tray) = app.state::<TrayMenuState>().tray.lock() {
                *tray = Some(tray_icon);
            }

            if shortcut_preferences.enabled {
                match app
                    .global_shortcut()
                    .register(shortcut_preferences.shortcut.as_str())
                {
                    Ok(()) => {
                        if let Ok(mut registered) =
                            app.state::<GlobalShortcutState>().registered.lock()
                        {
                            *registered = Some(shortcut_preferences.shortcut.clone());
                        }
                        update_tray_hotkey_hint(
                            app.handle(),
                            Some(shortcut_preferences.shortcut.as_str()),
                        )?;
                    }
                    Err(error) => {
                        eprintln!("Could not register the saved global shortcut: {error}");
                    }
                }
            }

            let main_window = app
                .get_webview_window("main")
                .ok_or("CyberFiles main window is missing")?;
            main_window
                .set_theme(Some(tauri::Theme::Dark))
                .map_err(|error| error.to_string())?;
            let state_path = window_state_path(app)?;
            restore_window_state(&main_window, &state_path)?;
            let window_for_close = main_window.clone();
            let app_for_window_events = app.handle().clone();
            let toggle_for_window_events = toggle.clone();
            main_window.on_window_event(move |event| match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    let _ = save_window_state(&window_for_close, &state_path);
                }
                tauri::WindowEvent::Resized(_) => {
                    refresh_tray_toggle_label(
                        &app_for_window_events,
                        &toggle_for_window_events,
                        &window_for_close,
                    );
                }
                tauri::WindowEvent::Focused(_) => {
                    refresh_tray_toggle_label(
                        &app_for_window_events,
                        &toggle_for_window_events,
                        &window_for_close,
                    );
                }
                _ => {}
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            show_main_window,
            hide_main_window,
            quit_app,
            list_directory,
            get_file_icons,
            calculate_folder_size,
            calculate_folder_size_bounded,
            start_folder_size_calculation,
            pause_folder_size_calculation,
            resume_folder_size_calculation,
            cancel_folder_size_calculation,
            read_text_preview,
            read_archive_preview,
            start_archive_extraction,
            start_zip_compression,
            prepare_pdf_preview,
            create_directory,
            create_text_file,
            create_shortcut,
            rename_item,
            start_copy_operation,
            start_move_operation,
            pause_transfer_operation,
            resume_transfer_operation,
            cancel_transfer_operation,
            set_file_clipboard,
            get_file_clipboard,
            clear_file_clipboard,
            read_clipboard_text,
            paste_clipboard_image,
            image_thumbnail,
            list_drives,
            list_system_locations,
            get_recycle_bin_status,
            list_recycle_bin,
            restore_recycle_bin_items,
            move_to_recycle_bin,
            permanently_delete_items,
            empty_recycle_bin,
            open_windows_file_properties,
            open_file_with_default_app,
            open_recycle_bin_in_explorer,
            open_folder_in_windows_explorer,
            open_terminal_here,
            list_windows_special_folders,
            edit_hosts_file,
            set_tray_language,
            get_global_shortcut_settings,
            set_global_shortcut_settings,
            get_instance_preferences,
            set_instance_preferences,
        ])
        .run(tauri::generate_context!())
        .expect("CyberFiles desktop shell failed to start");
}

#[cfg(test)]
mod tests {
    use super::{runtime_info, validate_recycle_source};
    use std::path::Path;

    #[test]
    fn exposes_development_runtime_metadata() {
        let info = runtime_info();

        assert_eq!(info.app_name, "CyberFiles");
        assert_eq!(info.mode, "development");
        assert!(!info.version.is_empty());
    }

    #[test]
    fn rejects_drive_and_unc_roots_for_recycle_bin_operations() {
        assert!(validate_recycle_source(Path::new(r"C:\")).is_err());
        assert!(validate_recycle_source(Path::new(r"\\server\share")).is_err());
    }

    #[test]
    fn rejects_paths_that_traverse_above_a_filesystem_root() {
        assert!(validate_recycle_source(Path::new(r"C:\folder\..")).is_err());
        assert!(validate_recycle_source(Path::new(r"C:\..\folder")).is_err());
    }

    #[test]
    fn accepts_fully_qualified_paths_below_a_root() {
        assert!(validate_recycle_source(Path::new(r"C:\folder\file.txt")).is_ok());
        assert!(validate_recycle_source(Path::new(r"\\server\share\folder")).is_err());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn reads_recycle_bin_status_without_mutating_files() {
        assert!(super::query_windows_recycle_bin().is_ok());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn enumerates_the_recycle_bin_without_mutating_files() {
        let page =
            super::list_windows_recycle_bin(0).expect("Recycle Bin enumeration should succeed");
        assert!(page.entries.len() <= super::RECYCLE_BIN_PAGE_SIZE);
        assert_eq!(page.next_offset, page.entries.len());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn configures_recycle_on_delete_without_performing_an_operation() {
        use super::CLSID_FILE_OPERATION;
        use windows::core::IUnknown;
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::{IFileOperation, FOFX_RECYCLEONDELETE, FOF_NO_UI};

        assert!(unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok());
        struct ComApartment;
        impl Drop for ComApartment {
            fn drop(&mut self) {
                unsafe { CoUninitialize() };
            }
        }
        let _apartment = ComApartment;
        let operation: IFileOperation = unsafe {
            CoCreateInstance(
                &CLSID_FILE_OPERATION,
                None::<&IUnknown>,
                CLSCTX_INPROC_SERVER,
            )
        }
        .expect("Windows should create its IFileOperation shell object");
        unsafe {
            operation
                .SetOperationFlags(FOF_NO_UI | FOFX_RECYCLEONDELETE)
                .expect("Windows should accept recycle-on-delete flags");
        }
    }
}
