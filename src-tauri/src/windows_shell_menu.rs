//! Real Windows Shell context menus ("Show more options") for CyberFiles.
//!
//! Builds the same `IContextMenu` Explorer uses for the selected paths, shows it
//! with `TrackPopupMenu` (owner-draw messages forwarded to `IContextMenu3` so
//! entries keep their icons and submenus behave), and invokes the chosen verb
//! through the Shell so third-party extensions work exactly as in File Explorer.

#[cfg(target_os = "windows")]
mod windows_impl {
  use std::cell::RefCell;
  use std::sync::mpsc;
  use windows::core::{Interface, PCSTR, PCWSTR};
  use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
  use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
  use windows::Win32::System::LibraryLoader::GetModuleHandleW;
  use windows::Win32::UI::Shell::Common::ITEMIDLIST;
  use windows::Win32::UI::Shell::{
    BHID_SFUIObject, CMF_NORMAL, CMINVOKECOMMANDINFOEX, CMIC_MASK_PTINVOKE, IContextMenu,
    IContextMenu3, ILFree, SHCreateItemFromIDList, SHCreateShellItemArrayFromIDLists,
    SHParseDisplayName,
  };
  use windows::Win32::UI::WindowsAndMessaging::{
    CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DestroyWindow,
    RegisterClassW, SetForegroundWindow, TrackPopupMenu, SW_SHOWNORMAL,
    TPM_LEFTBUTTON, TPM_RETURNCMD, TPM_RIGHTBUTTON, WINDOW_EX_STYLE, WM_DRAWITEM,
    WM_INITMENUPOPUP, WM_MEASUREITEM, WM_MENUCHAR, WNDCLASSW, WS_POPUP,
  };

  const MENU_ID_FIRST: u32 = 1;
  const MENU_ID_LAST: u32 = 0x7FFF;
  const OWNER_CLASS_NAME: &str = "CyberFilesShellMenuHost";
  /* Not exported by the windows crate; the documented CMIC_MASK_UNICODE value. */
  const CMIC_MASK_UNICODE: u32 = 0x0004_0000;

  thread_local! {
    /* The owner window forwards owner-draw traffic to the menu being tracked;
       one menu at a time lives on this thread. */
    static CONTEXT_MENU_FOR_DRAW: RefCell<Option<IContextMenu3>> = const { RefCell::new(None) };
  }

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

  /* Runs on its own STA thread: parses the paths, shows the real Shell menu at
     the original right-click position, and invokes the chosen verb. */
  pub fn show_shell_context_menu(paths: &[String], x: i32, y: i32) -> Result<bool, String> {
    let paths = paths.to_vec();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
      let outcome = (|| unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let context_menu = shell_context_menu_for_paths(&paths)?;
        let menu3: Option<IContextMenu3> = context_menu.cast().ok();
        let hwnd = create_owner_window()?;
        let result = (|| {
          let hmenu = CreatePopupMenu().map_err(|error| format!("Could not create the popup menu: {error}"))?;
          let query_result = context_menu.QueryContextMenu(hmenu, 0, MENU_ID_FIRST, MENU_ID_LAST, CMF_NORMAL);
          if query_result.is_err() {
            let _ = DestroyMenu(hmenu);
            return Err(format!("QueryContextMenu failed (HRESULT {query_result:?})"));
          }
          CONTEXT_MENU_FOR_DRAW.with(|cell| *cell.borrow_mut() = menu3.clone());
          let _ = SetForegroundWindow(hwnd);
          let selected = TrackPopupMenu(
            hmenu,
            TPM_RETURNCMD | TPM_LEFTBUTTON | TPM_RIGHTBUTTON,
            x,
            y,
            None,
            hwnd,
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
            hwnd,
            lpVerb: PCSTR((selected_id - MENU_ID_FIRST) as *const u8),
            lpParameters: PCSTR::null(),
            lpDirectory: PCSTR::null(),
            nShow: SW_SHOWNORMAL.0,
            dwHotKey: 0,
            hIcon: windows::Win32::Foundation::HANDLE::default(),
            lpTitle: PCSTR::null(),
            lpVerbW: PCWSTR::null(),
            lpParametersW: PCWSTR::null(),
            lpDirectoryW: PCWSTR::null(),
            lpTitleW: PCWSTR::null(),
            ptInvoke: POINT { x, y },
          };
          if let Err(error) = context_menu.InvokeCommand(&info as *const CMINVOKECOMMANDINFOEX as *const windows::Win32::UI::Shell::CMINVOKECOMMANDINFO) {
            return Err(format!("InvokeCommand failed: {error}"));
          }
          Ok(true)
        })();
        let _ = DestroyWindow(hwnd);
        result
      })();
      let _ = sender.send(outcome);
    });
    receiver.recv().map_err(|error| error.to_string())?
  }
}

#[cfg(target_os = "windows")]
pub use windows_impl::show_shell_context_menu;

#[cfg(not(target_os = "windows"))]
pub fn show_shell_context_menu(_paths: &[String], _x: i32, _y: i32) -> Result<bool, String> {
  Err("The Windows Shell context menu is only available on Windows".to_string())
}
