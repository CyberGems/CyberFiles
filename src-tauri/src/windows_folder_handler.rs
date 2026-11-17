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

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Unavailable,
    Off,
    On,
    NeedsRestore,
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
    Path::new(path).is_absolute().then(|| path.to_string())
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
    let command = command_for(&std::env::current_exe()?);
    let result = restore(&user_classes()?, Some(&command));
    notify_shell();
    result
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
            shell_folder_argument(r"\\server\share\A %USERPROFILE% folder\."),
            Some(r"\\server\share\A %USERPROFILE% folder".into())
        );
        assert_eq!(shell_folder_argument(r"relative\folder\."), None);
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
}
