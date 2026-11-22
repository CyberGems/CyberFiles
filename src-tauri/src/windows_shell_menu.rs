//! Real Windows Shell context menus ("Show more options") for CyberFiles.
//!
//! Two delivery paths over the same `IContextMenu` plumbing, both running on one
//! persistent STA host thread that owns a hidden parent window kept alive for as
//! long as Shell dialogs may need it:
//! - `show_shell_context_menu`: hands the built `HMENU` to `TrackPopupMenu`, so the
//!   OS renders and tracks the menu (fallback path).
//! - `build_shell_context_menu` / `invoke_shell_context_menu_verb` / `drop_shell_context_menu`:
//!   walks the built `HMENU` into a serializable model the frontend renders inside its
//!   own styled flyout menus, and invokes the chosen verb on demand.

use serde::Serialize;

/// One entry of the enumerated Shell menu, in render order.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellMenuEntry {
  pub kind: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub label: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub verb_id: Option<u32>,
  pub disabled: bool,
  pub checked: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub items: Option<Vec<ShellMenuEntry>>,
}

/// The enumerated menu plus the token that addresses its verbs.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltShellMenuPayload {
  pub token: u32,
  pub items: Vec<ShellMenuEntry>,
}

#[cfg(target_os = "windows")]
mod windows_impl {
  use std::cell::RefCell;
  use std::sync::atomic::{AtomicU32, Ordering};
  use std::sync::mpsc;
  use windows::core::{Interface, PCSTR, PCWSTR, PWSTR};
  use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, POINT, WPARAM};
  use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
  use windows::Win32::System::LibraryLoader::GetModuleHandleW;
  use windows::Win32::System::Threading::{CreateEventW, SetEvent};
  use windows::Win32::UI::Shell::Common::ITEMIDLIST;
  use windows::Win32::UI::Shell::{
    BHID_SFUIObject, CMF_NORMAL, CMINVOKECOMMANDINFOEX, CMIC_MASK_PTINVOKE,
    IContextMenu, IContextMenu3, ILFree, SHCreateItemFromIDList, SHCreateShellItemArrayFromIDLists,
    SHParseDisplayName,
  };

  /* Not exported by the windows crate; the documented CMIC_MASK_UNICODE value. */
  const CMIC_MASK_UNICODE: u32 = 0x0004_0000;
  use windows::Win32::UI::WindowsAndMessaging::{
    CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DispatchMessageW,
    GetMenuItemCount, GetMenuItemInfoW, MsgWaitForMultipleObjectsEx, PeekMessageW,
    RegisterClassW, SetForegroundWindow, TrackPopupMenu, HMENU, MENUITEMINFOW, MENU_ITEM_MASK,
    MIIM_FTYPE, MIIM_ID, MIIM_STATE, MIIM_STRING, MIIM_SUBMENU, MFT_BITMAP, MFT_OWNERDRAW,
    MFT_SEPARATOR, MFS_CHECKED, MFS_DISABLED, MSG, MWMO_INPUTAVAILABLE, PM_REMOVE,
    QS_ALLINPUT, SW_SHOWNORMAL, TPM_LEFTBUTTON, TPM_RETURNCMD, TPM_RIGHTBUTTON,
    TranslateMessage, WINDOW_EX_STYLE, WM_DRAWITEM, WM_INITMENUPOPUP, WM_MEASUREITEM,
    WM_MENUCHAR, WNDCLASSW, WS_POPUP,
  };

  use super::ShellMenuEntry;

  const MENU_ID_FIRST: u32 = 1;
  const MENU_ID_LAST: u32 = 0x7FFF;
  const OWNER_CLASS_NAME: &str = "CyberFilesShellMenuHost";

  thread_local! {
    /* The owner window forwards owner-draw traffic to the menu being tracked;
       one menu at a time lives on this thread. */
    static CONTEXT_MENU_FOR_DRAW: RefCell<Option<IContextMenu3>> = const { RefCell::new(None) };
    /* The menu built by the last "build" job, kept alive for verb invocation. */
    static ACTIVE_MENU: RefCell<Option<ActiveShellMenu>> = const { RefCell::new(None) };
    /* Hidden parent window for menus and Shell dialogs. Created once and kept
       alive forever: destroying it would close dialogs the Shell launched. */
    static HOST_OWNER: RefCell<Option<HWND>> = const { RefCell::new(None) };
  }

  static NEXT_MENU_TOKEN: AtomicU32 = AtomicU32::new(1);

  unsafe extern "system" fn shell_menu_wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if matches!(msg, WM_MEASUREITEM | WM_DRAWITEM | WM_INITMENUPOPUP | WM_MENUCHAR) {
      let forwarded = CONTEXT_MENU_FOR_DRAW.with(|cell| {
        let menu3 = cell.borrow().clone();
        menu3.map(|menu3| {
          let mut handled = LRESULT(0);
          let ok = if msg == WM_MENUCHAR {
            menu3.HandleMenuMsg2(msg, wparam, lparam, Some(&mut handled)).is_ok()
          } else {
            menu3.HandleMenuMsg(msg, wparam, lparam).is_ok()
          };
          ok.then_some(handled)
        })
      });
      if let Some(handled) = forwarded.flatten() {
        return handled;
      }
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
  }

  fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
  }

  struct OwnedPidl(*mut ITEMIDLIST);

  impl OwnedPidl {
    fn as_ptr(&self) -> *mut ITEMIDLIST {
      self.0
    }
  }

  impl Drop for OwnedPidl {
    fn drop(&mut self) {
      if !self.0.is_null() {
        unsafe {
          let _ = ILFree(Some(self.0.cast_const()));
        }
      }
    }
  }

  unsafe fn parse_path_pidl(path: &str) -> Result<OwnedPidl, String> {
    let wide = to_wide(path);
    let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
    SHParseDisplayName(PCWSTR(wide.as_ptr()), None, &mut pidl, 0, None)
      .map_err(|error| format!("'{path}': {error}"))?;
    if pidl.is_null() {
      return Err(format!("'{path}': the Shell returned no PIDL"));
    }
    Ok(OwnedPidl(pidl))
  }

  unsafe fn shell_context_menu_for_paths(paths: &[String]) -> Result<IContextMenu, String> {
    let owned: Vec<OwnedPidl> = paths
      .iter()
      .map(|path| parse_path_pidl(path))
      .collect::<Result<_, _>>()?;
    let pidls: Vec<*mut ITEMIDLIST> = owned.iter().map(|pidl| pidl.as_ptr()).collect();
    if pidls.is_empty() {
      return Err("No paths were provided".to_string());
    }
    let context_menu: IContextMenu = if pidls.len() == 1 {
      let item: windows::Win32::UI::Shell::IShellItem = SHCreateItemFromIDList(pidls[0]).map_err(|error| error.to_string())?;
      item.BindToHandler(None, &BHID_SFUIObject).map_err(|error| error.to_string())?
    } else {
      let item_refs: Vec<*const ITEMIDLIST> = pidls.iter().map(|pidl| *pidl as *const ITEMIDLIST).collect();
      let array = SHCreateShellItemArrayFromIDLists(item_refs.as_slice()).map_err(|error| error.to_string())?;
      array.BindToHandler(None, &BHID_SFUIObject).map_err(|error| error.to_string())?
    };
    Ok(context_menu)
  }

  unsafe fn create_owner_window() -> Result<HWND, String> {
    let hinstance = GetModuleHandleW(None).map_err(|error| error.to_string())?;
    let class_name = to_wide(OWNER_CLASS_NAME);
    let window_class = WNDCLASSW {
      lpfnWndProc: Some(shell_menu_wnd_proc),
      hInstance: hinstance.into(),
      lpszClassName: PCWSTR(class_name.as_ptr()),
      ..Default::default()
    };
    RegisterClassW(&window_class);
    let hwnd = CreateWindowExW(
      WINDOW_EX_STYLE(0),
      PCWSTR(class_name.as_ptr()),
      PCWSTR::null(),
      WS_POPUP,
      0,
      0,
      0,
      0,
      None,
      None,
      Some(hinstance.into()),
      None,
    )
    .map_err(|error| format!("Could not create the menu owner window: {error}"))?;
    Ok(hwnd)
  }

  /* Removes accelerator markers ("E&xit" -> "Exit") while keeping escaped
     ampersands ("Cu&&t" -> "Cu&t") and the characters after them ("&Abrir" -> "Abrir"). */
  fn clean_menu_label(raw: &str) -> String {
    let mut output = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();
    while let Some(character) = chars.next() {
      if character == '&' {
        match chars.peek() {
          Some('&') => {
            output.push('&');
            chars.next();
          }
          Some(_) => {}
          None => {}
        }
      } else {
        output.push(character);
      }
    }
    output.trim().to_string()
  }

  unsafe fn walk_shell_menu(hmenu: HMENU) -> Vec<ShellMenuEntry> {
    let count = GetMenuItemCount(Some(hmenu));
    let mut entries = Vec::new();
    for index in 0..count.max(0) as u32 {
      let mut info = MENUITEMINFOW {
        cbSize: std::mem::size_of::<MENUITEMINFOW>() as u32,
        fMask: MENU_ITEM_MASK(MIIM_FTYPE.0 | MIIM_ID.0 | MIIM_SUBMENU.0 | MIIM_STATE.0),
        ..Default::default()
      };
      if GetMenuItemInfoW(hmenu, index, true, &mut info).is_err() {
        continue;
      }
      if (info.fType.0 & MFT_SEPARATOR.0) != 0 {
        entries.push(ShellMenuEntry { kind: "separator".to_string(), label: None, verb_id: None, disabled: false, checked: false, items: None });
        continue;
      }
      /* Bitmap and fully owner-drawn entries cannot be represented as text in this
         phase, so they are omitted (the native popup stays as their fallback). */
      if (info.fType.0 & (MFT_BITMAP.0 | MFT_OWNERDRAW.0)) != 0 {
        continue;
      }
      let mut text_info = MENUITEMINFOW {
        cbSize: std::mem::size_of::<MENUITEMINFOW>() as u32,
        fMask: MENU_ITEM_MASK(MIIM_STRING.0),
        dwTypeData: PWSTR::null(),
        cch: 0,
        ..Default::default()
      };
      if GetMenuItemInfoW(hmenu, index, true, &mut text_info).is_err() {
        continue;
      }
      let length = text_info.cch as usize;
      if length == 0 {
        continue;
      }
      let mut buffer = vec![0u16; length + 1];
      text_info.dwTypeData = PWSTR(buffer.as_mut_ptr());
      text_info.cch = buffer.len() as u32;
      if GetMenuItemInfoW(hmenu, index, true, &mut text_info).is_err() {
        continue;
      }
      let label = clean_menu_label(&String::from_utf16_lossy(&buffer[..(text_info.cch as usize).min(buffer.len())]));
      let disabled = (info.fState.0 & MFS_DISABLED.0) != 0;
      let checked = (info.fState.0 & MFS_CHECKED.0) != 0;
      if !info.hSubMenu.is_invalid() {
        entries.push(ShellMenuEntry {
          kind: "submenu".to_string(),
          label: Some(label),
          verb_id: None,
          disabled,
          checked,
          items: Some(walk_shell_menu(info.hSubMenu)),
        });
        continue;
      }
      if info.wID < MENU_ID_FIRST || info.wID > MENU_ID_LAST {
        continue;
      }
      entries.push(ShellMenuEntry {
        kind: "entry".to_string(),
        label: Some(label),
        verb_id: Some(info.wID - MENU_ID_FIRST),
        disabled,
        checked,
        items: None,
      });
    }
    entries
  }

  struct ActiveShellMenu {
    token: u32,
    context_menu: IContextMenu,
    origin: POINT,
  }

  enum HostJob {
    Build {
      paths: Vec<String>,
      origin: POINT,
      reply: mpsc::Sender<Result<(u32, Vec<ShellMenuEntry>), String>>,
    },
    Invoke {
      token: u32,
      verb_id: u32,
      reply: mpsc::Sender<Result<(), String>>,
    },
    Show {
      paths: Vec<String>,
      x: i32,
      y: i32,
      reply: mpsc::Sender<Result<bool, String>>,
    },
    Drop {
      token: u32,
    },
  }

  struct HostSender {
    jobs: mpsc::Sender<HostJob>,
    wake: HANDLE,
  }

  /* The raw event handle is only used to wake the host thread. */
  unsafe impl Send for HostSender {}
  unsafe impl Sync for HostSender {}
  impl Clone for HostSender {
    fn clone(&self) -> Self {
      Self { jobs: self.jobs.clone(), wake: self.wake }
    }
  }

  struct SendHandle(HANDLE);

  unsafe impl Send for SendHandle {}

  static HOST_SENDER: std::sync::OnceLock<HostSender> = std::sync::OnceLock::new();

  fn host_sender() -> HostSender {
    HOST_SENDER.get_or_init(|| {
      let (jobs, receiver) = mpsc::channel::<HostJob>();
      /* The host thread waits on this event so queued jobs wake it up. */
      let wake = SendHandle(unsafe { CreateEventW(None, false, false, None) }.unwrap_or_default());
      let wake_for_sender = SendHandle(wake.0);
      std::thread::Builder::new()
        .name("shell-menu-host".to_string())
        .spawn(move || host_thread(receiver, wake))
        .expect("could not spawn the shell menu host thread");
      HostSender { jobs, wake: wake_for_sender.0 }
    })
    .clone()
  }

  unsafe fn host_owner() -> Result<HWND, String> {
    HOST_OWNER.with(|cell| cell.borrow().clone()).ok_or_else(|| "The menu owner window is unavailable".to_string())
  }

  unsafe fn pump_messages() {
    let mut message = MSG::default();
    while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
      let _ = TranslateMessage(&message);
      DispatchMessageW(&message);
    }
  }

  fn host_thread(receiver: mpsc::Receiver<HostJob>, wake: SendHandle) {
    unsafe {
      let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
      let wake = wake.0;
      let owner = create_owner_window().ok();
      HOST_OWNER.with(|cell| *cell.borrow_mut() = owner);
      loop {
        /* The STA queue must be pumped continuously: Shell dialogs launched by
           InvokeCommand live on this thread and die without a message pump. */
        pump_messages();
        if let Ok(job) = receiver.try_recv() {
          match job {
            HostJob::Build { paths, origin, reply } => {
              let _ = reply.send(build_active_menu(&paths, origin));
            }
            HostJob::Invoke { token, verb_id, reply } => {
              let _ = reply.send(invoke_active_menu(token, verb_id));
            }
            HostJob::Show { paths, x, y, reply } => {
              let _ = reply.send(show_popup_menu(&paths, x, y));
            }
            HostJob::Drop { token } => {
              drop_active_menu(token);
            }
          }
          pump_messages();
          continue;
        }
        /* Sleep until a job arrives (event) or Windows messages show up. */
        let _ = MsgWaitForMultipleObjectsEx(Some(&[wake]), 0xFFFFFFFF, QS_ALLINPUT, MWMO_INPUTAVAILABLE);
      }
    }
  }

  unsafe fn build_active_menu(paths: &[String], origin: POINT) -> Result<(u32, Vec<ShellMenuEntry>), String> {
    let context_menu = shell_context_menu_for_paths(paths)?;
    let hmenu = CreatePopupMenu().map_err(|error| format!("Could not create the popup menu: {error}"))?;
    let query_result = context_menu.QueryContextMenu(hmenu, 0, MENU_ID_FIRST, MENU_ID_LAST, CMF_NORMAL);
    if query_result.is_err() {
      let _ = DestroyMenu(hmenu);
      return Err(format!("QueryContextMenu failed (HRESULT {query_result:?})"));
    }
    let items = walk_shell_menu(hmenu);
    let _ = DestroyMenu(hmenu);
    let token = NEXT_MENU_TOKEN.fetch_add(1, Ordering::Relaxed);
    ACTIVE_MENU.with(|cell| {
      *cell.borrow_mut() = Some(ActiveShellMenu { token, context_menu, origin });
    });
    Ok((token, items))
  }

  unsafe fn invoke_active_menu(token: u32, verb_id: u32) -> Result<(), String> {
    let active = ACTIVE_MENU.with(|cell| {
      let borrowed = cell.borrow();
      borrowed.as_ref().filter(|menu| menu.token == token).map(|menu| (menu.context_menu.clone(), menu.origin))
    });
    let Some((context_menu, origin)) = active else {
      return Err("The Shell menu is no longer available; open it again.".to_string());
    };
    let owner = host_owner()?;
    let info = CMINVOKECOMMANDINFOEX {
      cbSize: std::mem::size_of::<CMINVOKECOMMANDINFOEX>() as u32,
      fMask: CMIC_MASK_UNICODE | CMIC_MASK_PTINVOKE,
      hwnd: owner,
      lpVerb: PCSTR(verb_id as *const u8),
      lpParameters: PCSTR::null(),
      lpDirectory: PCSTR::null(),
      nShow: SW_SHOWNORMAL.0,
      dwHotKey: 0,
      hIcon: windows::Win32::Foundation::HANDLE::default(),
      lpTitle: PCSTR::null(),
      /* With CMIC_MASK_UNICODE the Unicode verb wins; it must carry the same
         MAKEINTRESOURCEW id or the invocation silently does nothing. */
      lpVerbW: PCWSTR(verb_id as *const u16),
      lpParametersW: PCWSTR::null(),
      lpDirectoryW: PCWSTR::null(),
      lpTitleW: PCWSTR::null(),
      ptInvoke: origin,
    };
    let result = context_menu.InvokeCommand(&info as *const CMINVOKECOMMANDINFOEX as *const windows::Win32::UI::Shell::CMINVOKECOMMANDINFO);
    result.map_err(|error| format!("InvokeCommand failed: {error}"))
  }

  unsafe fn show_popup_menu(paths: &[String], x: i32, y: i32) -> Result<bool, String> {
    let owner = host_owner()?;
    let context_menu = shell_context_menu_for_paths(paths)?;
    let hmenu = CreatePopupMenu().map_err(|error| format!("Could not create the popup menu: {error}"))?;
    let query_result = context_menu.QueryContextMenu(hmenu, 0, MENU_ID_FIRST, MENU_ID_LAST, CMF_NORMAL);
    if query_result.is_err() {
      let _ = DestroyMenu(hmenu);
      return Err(format!("QueryContextMenu failed (HRESULT {query_result:?})"));
    }
    let menu3: Option<IContextMenu3> = context_menu.cast().ok();
    CONTEXT_MENU_FOR_DRAW.with(|cell| *cell.borrow_mut() = menu3.clone());
    let _ = SetForegroundWindow(owner);
    let selected = TrackPopupMenu(
      hmenu,
      TPM_RETURNCMD | TPM_LEFTBUTTON | TPM_RIGHTBUTTON,
      x,
      y,
      None,
      owner,
      None,
    );
    let _ = DestroyMenu(hmenu);
    CONTEXT_MENU_FOR_DRAW.with(|cell| *cell.borrow_mut() = None);
    let selected_id = selected.0 as u32;
    if selected_id == 0 {
      return Ok(false);
    }
    let info = CMINVOKECOMMANDINFOEX {
      cbSize: std::mem::size_of::<CMINVOKECOMMANDINFOEX>() as u32,
      fMask: CMIC_MASK_UNICODE | CMIC_MASK_PTINVOKE,
      hwnd: owner,
      lpVerb: PCSTR((selected_id - MENU_ID_FIRST) as *const u8),
      lpParameters: PCSTR::null(),
      lpDirectory: PCSTR::null(),
      nShow: SW_SHOWNORMAL.0,
      dwHotKey: 0,
      hIcon: windows::Win32::Foundation::HANDLE::default(),
      lpTitle: PCSTR::null(),
      lpVerbW: PCWSTR((selected_id - MENU_ID_FIRST) as *const u16),
      lpParametersW: PCWSTR::null(),
      lpDirectoryW: PCWSTR::null(),
      lpTitleW: PCWSTR::null(),
      ptInvoke: POINT { x, y },
    };
    let result = context_menu.InvokeCommand(&info as *const CMINVOKECOMMANDINFOEX as *const windows::Win32::UI::Shell::CMINVOKECOMMANDINFO);
    result.map_err(|error| format!("InvokeCommand failed: {error}"))?;
    Ok(true)
  }

  fn drop_active_menu(token: u32) {
    ACTIVE_MENU.with(|cell| {
      if cell.borrow().as_ref().is_some_and(|menu| menu.token == token) {
        *cell.borrow_mut() = None;
      }
    });
  }

  pub fn build_shell_context_menu(paths: &[String], x: i32, y: i32) -> Result<super::BuiltShellMenuPayload, String> {
    let host = host_sender();
    let (reply, receiver) = mpsc::channel();
    host
      .jobs
      .send(HostJob::Build { paths: paths.to_vec(), origin: POINT { x, y }, reply })
      .map_err(|error| format!("The Shell menu host is not running: {error}"))?;
    unsafe { let _ = SetEvent(host.wake); }
    let (token, items) = receiver.recv().map_err(|error| error.to_string())??;
    Ok(super::BuiltShellMenuPayload { token, items })
  }

  pub fn invoke_shell_context_menu_verb(token: u32, verb_id: u32) -> Result<(), String> {
    let host = host_sender();
    let (reply, receiver) = mpsc::channel();
    host
      .jobs
      .send(HostJob::Invoke { token, verb_id, reply })
      .map_err(|error| format!("The Shell menu host is not running: {error}"))?;
    unsafe { let _ = SetEvent(host.wake); }
    receiver.recv().map_err(|error| error.to_string())?
  }

  pub fn show_shell_context_menu(paths: &[String], x: i32, y: i32) -> Result<bool, String> {
    let host = host_sender();
    let (reply, receiver) = mpsc::channel();
    host
      .jobs
      .send(HostJob::Show { paths: paths.to_vec(), x, y, reply })
      .map_err(|error| format!("The Shell menu host is not running: {error}"))?;
    unsafe { let _ = SetEvent(host.wake); }
    receiver.recv().map_err(|error| error.to_string())?
  }

  pub fn drop_shell_context_menu(token: u32) {
    let host = host_sender();
    let _ = host.jobs.send(HostJob::Drop { token });
    unsafe { let _ = SetEvent(host.wake); }
  }
}

#[cfg(target_os = "windows")]
pub use windows_impl::{
  build_shell_context_menu, drop_shell_context_menu, invoke_shell_context_menu_verb,
  show_shell_context_menu,
};

#[cfg(not(target_os = "windows"))]
pub fn show_shell_context_menu(_paths: &[String], _x: i32, _y: i32) -> Result<bool, String> {
  Err("The Windows Shell context menu is only available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn build_shell_context_menu(_paths: &[String], _x: i32, _y: i32) -> Result<BuiltShellMenuPayload, String> {
  Err("The Windows Shell context menu is only available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn invoke_shell_context_menu_verb(_token: u32, _verb_id: u32) -> Result<(), String> {
  Err("The Windows Shell context menu is only available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn drop_shell_context_menu(_token: u32) {}
