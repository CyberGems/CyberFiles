use std::{io, path::Path, ptr};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, WAIT_ABANDONED, WAIT_OBJECT_0},
    System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject},
    UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST},
};
use winreg::{
    enums::{HKEY_CURRENT_USER, KEY_ALL_ACCESS},
    types::FromRegValue,
    RegKey,
};

const SHELL_KEYS: [&str; 2] = [r"Directory\shell", r"Drive\shell"];
const VERB: &str = "CyberFiles.OpenFolder";
const PREVIOUS_DEFAULT: &str = "PreviousDefault";
const WIN_E_CLSID_KEY: &str = r"CLSID\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}";
const WIN_E_COMMAND_KEYS: [&str; 2] = [
    r"CLSID\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}\shell\OpenNewWindow\command",
    r"CLSID\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}\shell\open\command",
];
const WIN_E_MARKER: &str = "CyberFilesOwner";
const PREVIOUS_DELEGATE_EXECUTE: &str = "PreviousDelegateExecute";

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Unavailable,
    Off,
    On,
    NeedsRestore,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderHandlerException {
    pub path: String,
    #[serde(default)]
    pub include_subfolders: bool,
}

pub fn normalize_exception_path(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }
    let expanded = crate::expand_windows_environment_path(trimmed).replace('/', "\\");
    let without_verbatim = expanded.strip_prefix(r"\\?\").unwrap_or(&expanded);
    if matches!(without_verbatim.as_bytes(), [drive, b':'] if drive.is_ascii_alphabetic()) {
        return Some(format!("{}:\\", (without_verbatim.as_bytes()[0] as char).to_ascii_uppercase()));
    }
    if matches!(without_verbatim.as_bytes(), [drive, b':', b'\\'] if drive.is_ascii_alphabetic()) {
        return Some(format!("{}:\\", (without_verbatim.as_bytes()[0] as char).to_ascii_uppercase()));
    }
    let cleaned = without_verbatim.trim_end_matches('\\');
    if cleaned.is_empty() || !Path::new(cleaned).is_absolute() {
        return None;
    }
    if matches!(cleaned.as_bytes(), [drive, b':', b'\\', ..] if drive.is_ascii_alphabetic()) {
        let mut normalized = cleaned.to_string();
        if let Some(first) = normalized.get_mut(0..1) {
            first.make_ascii_uppercase();
        }
        return Some(normalized);
    }
    Some(cleaned.to_string())
}

pub fn sanitize_exceptions(entries: Vec<FolderHandlerException>) -> Vec<FolderHandlerException> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for entry in entries {
        let Some(normalized) = normalize_exception_path(&entry.path) else {
            continue;
        };
        let key = normalized.to_lowercase();
        if seen.insert(key) {
            out.push(FolderHandlerException {
                path: normalized,
                include_subfolders: entry.include_subfolders,
            });
            if out.len() >= 200 {
                break;
            }
        }
    }
    out
}

pub fn matches_folder_exception(target_path: &str, exceptions: &[FolderHandlerException]) -> bool {
    let Some(target_norm) = normalize_exception_path(target_path) else {
        return false;
    };
    let target_lower = target_norm.to_lowercase();
    let target_trimmed = target_lower.trim_end_matches('\\');
    for exception in exceptions {
        let Some(exc_norm) = normalize_exception_path(&exception.path) else {
            continue;
        };
        let exc_lower = exc_norm.to_lowercase();
        if target_lower == exc_lower || target_trimmed == exc_lower.trim_end_matches('\\') {
            return true;
        }
        if exception.include_subfolders {
            let prefix = format!("{}\\", exc_lower.trim_end_matches('\\'));
            if target_lower.starts_with(&prefix) {
                return true;
            }
        }
    }
    false
}

struct RegistryLock(HANDLE);

impl RegistryLock {
    fn acquire() -> io::Result<Self> {
        let name: Vec<u16> = "Local\\com.cybergems.cyberfiles.folder-handler"
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let handle = unsafe { CreateMutexW(ptr::null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        match unsafe { WaitForSingleObject(handle, 5_000) } {
            WAIT_OBJECT_0 | WAIT_ABANDONED => Ok(Self(handle)),
            _ => {
                unsafe { CloseHandle(handle) };
                Err(io::Error::other(
                    "Could not lock the CyberFiles folder registration",
                ))
            }
        }
    }
}

impl Drop for RegistryLock {
    fn drop(&mut self) {
        unsafe {
            ReleaseMutex(self.0);
            CloseHandle(self.0);
        }
    }
}

fn optional<T>(result: io::Result<T>) -> io::Result<Option<T>> {
    match result {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn uses_cyberfiles(shell: &RegKey) -> io::Result<bool> {
    Ok(optional(shell.get_raw_value(""))?
        .and_then(|value| String::from_reg_value(&value).ok())
        .is_some_and(|value| value.eq_ignore_ascii_case(VERB)))
}

fn registered_command(verb: &RegKey) -> io::Result<Option<String>> {
    Ok(optional(
        verb.open_subkey("command")
            .and_then(|key| key.get_raw_value("")),
    )?
    .and_then(|value| String::from_reg_value(&value).ok()))
}

fn status_in(classes: &RegKey, command: &str) -> io::Result<Status> {
    let mut active = 0;
    let mut has_registration = false;
    for path in SHELL_KEYS {
        let Some(shell) = optional(classes.open_subkey(path))? else {
            continue;
        };
        let selected = uses_cyberfiles(&shell)?;
        let verb = optional(shell.open_subkey(VERB))?;
        has_registration |= selected || verb.is_some();
        if let Some(verb) = verb {
            if selected && registered_command(&verb)?.as_deref() == Some(command) {
                active += 1;
            }
        }
    }
    Ok(if active == SHELL_KEYS.len() {
        Status::On
    } else if has_registration {
        Status::NeedsRestore
    } else {
        Status::Off
    })
}

fn register(classes: &RegKey, executable: &Path, command: &str) -> io::Result<()> {
    for path in SHELL_KEYS {
        let (shell, _) = classes.create_subkey(path)?;
        let previous = optional(shell.get_raw_value(""))?;
        let (verb, _) = shell.create_subkey(VERB)?;
        if let Some(value) = previous {
            verb.set_raw_value(PREVIOUS_DEFAULT, &value)?;
        }
        verb.set_value("", &"CyberFiles")?;
        verb.set_value("Icon", &format!("\"{}\",0", executable.display()))?;
        verb.create_subkey("command")?.0.set_value("", &command)?;
        shell.set_value("", &VERB)?;
    }
    Ok(())
}

fn restore_shell(classes: &RegKey, path: &str, owner: Option<&str>) -> io::Result<()> {
    let Some(shell) = optional(classes.open_subkey_with_flags(path, KEY_ALL_ACCESS))? else {
        return Ok(());
    };
    let verb = optional(shell.open_subkey(VERB))?;
    if let Some(owner) = owner {
        let Some(verb) = &verb else { return Ok(()) };
        if registered_command(verb)?.as_deref() != Some(owner) {
            return Ok(());
        }
    }

    // Another file manager may have become the default while CyberFiles was registered.
    if uses_cyberfiles(&shell)? {
        let previous = match &verb {
            Some(verb) => optional(verb.get_raw_value(PREVIOUS_DEFAULT))?,
            None => None,
        };
        match previous {
            Some(value) => shell.set_raw_value("", &value)?,
            None => shell.delete_value("")?,
        }
    }
    if verb.is_some() {
        drop(verb);
        optional(shell.delete_subkey_all(VERB))?;
    }
    Ok(())
}

fn restore(classes: &RegKey, owner: Option<&str>) -> io::Result<()> {
    let [directory, drive] = SHELL_KEYS.map(|path| restore_shell(classes, path, owner));
    directory.and(drive)
}

fn command_for(executable: &Path) -> String {
    // The fixed suffix keeps a root's trailing backslash from escaping the closing quote.
    format!("\"{}\" --shell-folder \"%1\\.\"", executable.display())
}

pub fn shell_folder_argument(argument: &str) -> Option<String> {
    let path = argument.strip_suffix(r"\.")?;
    if matches!(path.as_bytes(), [drive, b':'] if drive.is_ascii_alphabetic()) {
        return Some(format!("{path}\\"));
    }
    if matches!(path.as_bytes(), [drive, b':', b'\\'] if drive.is_ascii_alphabetic()) {
        return Some(path.to_string());
    }
    let trimmed = path.trim_end_matches('\\');
    Path::new(trimmed).is_absolute().then(|| trimmed.to_string())
}

fn notify_shell() {
    unsafe {
        SHChangeNotify(
            SHCNE_ASSOCCHANGED as i32,
            SHCNF_IDLIST,
            ptr::null(),
            ptr::null(),
        )
    }
}

fn user_classes() -> io::Result<RegKey> {
    RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(r"Software\Classes", KEY_ALL_ACCESS)
}

pub fn status() -> io::Result<Status> {
    if crate::is_portable_build() {
        return Ok(Status::Unavailable);
    }
    let _lock = RegistryLock::acquire()?;
    status_in(&user_classes()?, &command_for(&std::env::current_exe()?))
}

pub fn set_enabled(enabled: bool) -> io::Result<Status> {
    if crate::is_portable_build() {
        return Ok(Status::Unavailable);
    }
    let _lock = RegistryLock::acquire()?;
    let classes = user_classes()?;
    let executable = std::env::current_exe()?;
    let command = command_for(&executable);
    let before = status_in(&classes, &command)?;
    let result = match (enabled, before) {
        (false, Status::Off) => return Ok(Status::Off),
        (false, _) => restore(&classes, None),
        (true, Status::On) => return Ok(Status::On),
        (true, Status::NeedsRestore) => {
            return Err(io::Error::other(
                "Restore the previous folder settings before enabling CyberFiles",
            ));
        }
        (true, _) => match register(&classes, &executable, &command) {
            Ok(()) => Ok(()),
            Err(error) => match restore(&classes, None) {
                Ok(()) => Err(error),
                Err(restore_error) => Err(io::Error::other(format!(
                    "{error}. Restoration failed: {restore_error}"
                ))),
            },
        },
    };
    notify_shell();
    result?;
    status_in(&classes, &command)
}

pub fn unregister_for_uninstall() -> io::Result<()> {
    let _lock = RegistryLock::acquire()?;
    let exe = std::env::current_exe()?;
    let command = command_for(&exe);
    let win_e_cmd = win_e_command_for(&exe);
    let classes = user_classes()?;
    let folder_result = restore(&classes, Some(&command));
    let win_e_result = restore_win_e(&classes, Some(&win_e_cmd));
    notify_shell();
    folder_result.and(win_e_result)
}

fn win_e_command_for(executable: &Path) -> String {
    format!("\"{}\"", executable.display())
}

fn win_e_status_in(classes: &RegKey, command: &str) -> io::Result<Status> {
    let mut active = 0;
    let mut has_registration = false;
    for path in WIN_E_COMMAND_KEYS {
        let Some(cmd_key) = optional(classes.open_subkey(path))? else {
            continue;
        };
        let marker = optional(cmd_key.get_raw_value(WIN_E_MARKER))?
            .and_then(|v| String::from_reg_value(&v).ok());
        let default_val = optional(cmd_key.get_raw_value(""))?
            .and_then(|v| String::from_reg_value(&v).ok());
        let delegate_val = optional(cmd_key.get_raw_value("DelegateExecute"))?
            .and_then(|v| String::from_reg_value(&v).ok());
        let is_ours = default_val.as_deref() == Some(command)
            && delegate_val.as_deref() == Some("");
        has_registration |= marker.is_some() || is_ours;
        if is_ours && marker.as_deref() == Some(command) {
            active += 1;
        }
    }
    Ok(if active == WIN_E_COMMAND_KEYS.len() {
        Status::On
    } else if has_registration {
        Status::NeedsRestore
    } else {
        Status::Off
    })
}

fn register_win_e(classes: &RegKey, command: &str) -> io::Result<()> {
    for path in WIN_E_COMMAND_KEYS {
        let (cmd_key, _) = classes.create_subkey(path)?;
        let existing_marker = optional(cmd_key.get_raw_value(WIN_E_MARKER))?;
        if existing_marker.is_none() {
            if let Some(previous_default) = optional(cmd_key.get_raw_value(""))? {
                cmd_key.set_raw_value(PREVIOUS_DEFAULT, &previous_default)?;
            }
            if let Some(previous_delegate) = optional(cmd_key.get_raw_value("DelegateExecute"))? {
                cmd_key.set_raw_value(PREVIOUS_DELEGATE_EXECUTE, &previous_delegate)?;
            }
        }
        cmd_key.set_value(WIN_E_MARKER, &command)?;
        cmd_key.set_value("", &command)?;
        cmd_key.set_value("DelegateExecute", &"")?;
    }
    Ok(())
}

fn restore_win_e_key(classes: &RegKey, path: &str, owner: Option<&str>) -> io::Result<()> {
    let Some(cmd_key) = optional(classes.open_subkey_with_flags(path, KEY_ALL_ACCESS))? else {
        return Ok(());
    };
    let marker = optional(cmd_key.get_raw_value(WIN_E_MARKER))?
        .and_then(|v| String::from_reg_value(&v).ok());
    if let Some(owner) = owner {
        if marker.as_deref() != Some(owner) {
            return Ok(());
        }
    }
    let current_default = optional(cmd_key.get_raw_value(""))?
        .and_then(|v| String::from_reg_value(&v).ok());
    let still_ours = marker.is_some() && current_default == marker;
    let prev_default = optional(cmd_key.get_raw_value(PREVIOUS_DEFAULT))?;
    let prev_delegate = optional(cmd_key.get_raw_value(PREVIOUS_DELEGATE_EXECUTE))?;

    if still_ours {
        match prev_default {
            Some(value) => cmd_key.set_raw_value("", &value)?,
            None => {
                optional(cmd_key.delete_value(""))?;
            }
        }
        match prev_delegate {
            Some(value) => cmd_key.set_raw_value("DelegateExecute", &value)?,
            None => {
                optional(cmd_key.delete_value("DelegateExecute"))?;
            }
        }
    }
    optional(cmd_key.delete_value(WIN_E_MARKER))?;
    optional(cmd_key.delete_value(PREVIOUS_DEFAULT))?;
    optional(cmd_key.delete_value(PREVIOUS_DELEGATE_EXECUTE))?;
    Ok(())
}

fn is_win_e_command_key_empty(classes: &RegKey, path: &str) -> io::Result<bool> {
    let Some(cmd_key) = optional(classes.open_subkey(path))? else {
        return Ok(true);
    };
    let has_default = optional(cmd_key.get_raw_value(""))?.is_some();
    let has_delegate = optional(cmd_key.get_raw_value("DelegateExecute"))?.is_some();
    let has_marker = optional(cmd_key.get_raw_value(WIN_E_MARKER))?.is_some();
    Ok(!has_default && !has_delegate && !has_marker)
}

fn restore_win_e(classes: &RegKey, owner: Option<&str>) -> io::Result<()> {
    let [open_new_window, open] =
        WIN_E_COMMAND_KEYS.map(|path| restore_win_e_key(classes, path, owner));
    open_new_window.and(open)?;
    if WIN_E_COMMAND_KEYS
        .iter()
        .all(|path| is_win_e_command_key_empty(classes, path).unwrap_or(false))
    {
        optional(classes.delete_subkey_all(WIN_E_CLSID_KEY))?;
    }
    Ok(())
}

pub fn win_e_status() -> io::Result<Status> {
    if crate::is_portable_build() {
        return Ok(Status::Unavailable);
    }
    let _lock = RegistryLock::acquire()?;
    win_e_status_in(&user_classes()?, &win_e_command_for(&std::env::current_exe()?))
}

pub fn set_win_e_enabled(enabled: bool) -> io::Result<Status> {
    if crate::is_portable_build() {
        return Ok(Status::Unavailable);
    }
    let _lock = RegistryLock::acquire()?;
    let classes = user_classes()?;
    let executable = std::env::current_exe()?;
    let command = win_e_command_for(&executable);
    let before = win_e_status_in(&classes, &command)?;
    let result = match (enabled, before) {
        (false, Status::Off) => return Ok(Status::Off),
        (false, _) => restore_win_e(&classes, None),
        (true, Status::On) => return Ok(Status::On),
        (true, Status::NeedsRestore) => {
            return Err(io::Error::other(
                "Restore the previous Win+E shortcut settings before enabling CyberFiles",
            ));
        }
        (true, _) => match register_win_e(&classes, &command) {
            Ok(()) => Ok(()),
            Err(error) => match restore_win_e(&classes, None) {
                Ok(()) => Err(error),
                Err(restore_error) => Err(io::Error::other(format!(
                    "{error}. Restoration failed: {restore_error}"
                ))),
            },
        },
    };
    notify_shell();
    result?;
    win_e_status_in(&classes, &command)
}

#[cfg(test)]
mod tests {
    use super::*;
    use winreg::{enums::REG_EXPAND_SZ, RegValue};

    #[test]
    fn shell_arguments_keep_drive_roots_and_literal_folder_names() {
        assert_eq!(shell_folder_argument(r"C:\\."), Some(r"C:\".into()));
        assert_eq!(shell_folder_argument(r"C:\."), Some(r"C:\".into()));
        assert_eq!(
            shell_folder_argument(r"C:\Users\Carlos\\."),
            Some(r"C:\Users\Carlos".into())
        );
        assert_eq!(
            shell_folder_argument(r"\\server\share\A %USERPROFILE% folder\."),
            Some(r"\\server\share\A %USERPROFILE% folder".into())
        );
        assert_eq!(shell_folder_argument(r"relative\folder\."), None);
    }

    #[test]
    fn matches_exact_and_descendant_folder_exceptions() {
        let exceptions = sanitize_exceptions(vec![
            FolderHandlerException {
                path: r"c:\work\legacy\".into(),
                include_subfolders: false,
            },
            FolderHandlerException {
                path: r"D:\Shared\ExplorerOnly".into(),
                include_subfolders: true,
            },
        ]);
        assert!(matches_folder_exception(r"C:\Work\Legacy", &exceptions));
        assert!(!matches_folder_exception(r"C:\Work\Legacy\Subfolder", &exceptions));
        assert!(matches_folder_exception(r"D:\Shared\ExplorerOnly", &exceptions));
        assert!(matches_folder_exception(r"D:\Shared\ExplorerOnly\Deep\Child", &exceptions));
        assert!(!matches_folder_exception(r"D:\Shared\ExplorerOnlyOther", &exceptions));
    }

    #[test]
    fn restoring_preserves_existing_and_newer_folder_choices() -> io::Result<()> {
        struct TestKey(String);
        impl Drop for TestKey {
            fn drop(&mut self) {
                RegKey::predef(HKEY_CURRENT_USER)
                    .delete_subkey_all(&self.0)
                    .unwrap();
            }
        }

        let root = RegKey::predef(HKEY_CURRENT_USER);
        let test_path = format!(
            r"Software\CyberFiles.FolderHandlerTest.{}",
            std::process::id()
        );
        let (classes, _) = root.create_subkey(&test_path)?;
        let _test_key = TestKey(test_path);
        let (directory, _) = classes.create_subkey(SHELL_KEYS[0])?;
        let (drive, _) = classes.create_subkey(SHELL_KEYS[1])?;
        let original = RegValue {
            bytes: "%OTHER_HANDLER%\0"
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect(),
            vtype: REG_EXPAND_SZ,
        };
        directory.set_raw_value("", &original)?;
        let exe = Path::new(r"C:\Program Files\CyberFiles\CyberFiles.exe");
        let command = command_for(exe);

        assert_eq!(status_in(&classes, &command)?, Status::Off);
        register(&classes, exe, &command)?;
        assert_eq!(status_in(&classes, &command)?, Status::On);
        restore(&classes, Some("another installation"))?;
        assert_eq!(status_in(&classes, &command)?, Status::On);
        restore(&classes, Some(&command))?;
        assert_eq!(directory.get_raw_value("")?, original);
        assert!(optional(drive.get_raw_value(""))?.is_none());

        register(&classes, exe, &command)?;
        drive.set_value("", &"AnotherFileManager")?;
        assert_eq!(status_in(&classes, &command)?, Status::NeedsRestore);
        restore(&classes, None)?;
        assert_eq!(directory.get_raw_value("")?, original);
        assert_eq!(drive.get_value::<String, _>("")?, "AnotherFileManager");
        assert_eq!(status_in(&classes, &command)?, Status::Off);
        Ok(())
    }

    #[test]
    fn win_e_registration_and_restore_preserves_previous_values() -> io::Result<()> {
        struct TestKey(String);
        impl Drop for TestKey {
            fn drop(&mut self) {
                let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(&self.0);
            }
        }

        let root = RegKey::predef(HKEY_CURRENT_USER);
        let test_path = format!(
            r"Software\CyberFiles.WinEHandlerTest.{}",
            std::process::id()
        );
        let (classes, _) = root.create_subkey(&test_path)?;
        let _test_key = TestKey(test_path);

        let exe = Path::new(r"C:\Program Files\CyberFiles\CyberFiles.exe");
        let command = win_e_command_for(exe);

        assert_eq!(win_e_status_in(&classes, &command)?, Status::Off);
        register_win_e(&classes, &command)?;
        assert_eq!(win_e_status_in(&classes, &command)?, Status::On);

        let open_new_window = classes.open_subkey(WIN_E_COMMAND_KEYS[0])?;
        assert_eq!(open_new_window.get_value::<String, _>("")?, command);
        assert_eq!(open_new_window.get_value::<String, _>("DelegateExecute")?, "");
        drop(open_new_window);

        restore_win_e(&classes, Some("other-exe"))?;
        assert_eq!(win_e_status_in(&classes, &command)?, Status::On);

        restore_win_e(&classes, Some(&command))?;
        assert_eq!(win_e_status_in(&classes, &command)?, Status::Off);
        assert!(optional(classes.open_subkey(WIN_E_CLSID_KEY))?.is_none());
        Ok(())
    }
}
