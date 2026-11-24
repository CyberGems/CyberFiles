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
  pub icon: Option<String>,
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
  use std::collections::VecDeque;
  use std::sync::atomic::{AtomicU32, Ordering};
  use std::sync::mpsc;
  use windows::core::{Interface, PCSTR, PCWSTR, PWSTR};
  use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
  use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
  use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GdiFlush, GetSysColor, PatBlt,
    SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, COLOR_BTNFACE, COLOR_MENU, DIB_RGB_COLORS,
    HBITMAP, HDC, HGDIOBJ, WHITENESS,
  };
  use windows::Win32::System::LibraryLoader::GetModuleHandleW;
  use windows::Win32::System::Threading::{CreateEventW, SetEvent};
  use windows::Win32::UI::Controls::{
    DRAWITEMSTRUCT, MEASUREITEMSTRUCT, ODA_DRAWENTIRE, ODS_FLAGS, ODT_MENU,
  };
  use windows::Win32::UI::Shell::Common::ITEMIDLIST;
  use windows::Win32::UI::Shell::{
    BHID_SFUIObject, CMF_NORMAL, CMINVOKECOMMANDINFOEX, CMIC_MASK_PTINVOKE,
    IContextMenu, IContextMenu2, IContextMenu3, ILFree, SHCreateItemFromIDList,
    SHCreateShellItemArrayFromIDLists, SHParseDisplayName,
  };

  /* Not exported by the windows crate; the documented CMIC_MASK_UNICODE value. */
  const CMIC_MASK_UNICODE: u32 = 0x0004_0000;
  use windows::Win32::UI::WindowsAndMessaging::{
    CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu, DispatchMessageW,
    GetMenuItemCount, GetMenuItemInfoW, GetSystemMetrics, MsgWaitForMultipleObjectsEx,
    PeekMessageW,
    RegisterClassW, SetForegroundWindow, TrackPopupMenu, HMENU, MENUITEMINFOW, MENU_ITEM_MASK,
    MIIM_BITMAP, MIIM_CHECKMARKS, MIIM_DATA, MIIM_FTYPE, MIIM_ID, MIIM_STATE, MIIM_STRING,
    MIIM_SUBMENU, MFT_BITMAP, MFT_OWNERDRAW, MFT_SEPARATOR, MFS_CHECKED, MFS_DISABLED, MSG,
    MWMO_INPUTAVAILABLE, PM_REMOVE, QS_ALLINPUT, SM_CXSMICON, SM_CYSMICON, SW_SHOWNORMAL,
    TPM_LEFTBUTTON, TPM_RETURNCMD, TPM_RIGHTBUTTON, TranslateMessage, WINDOW_EX_STYLE, WM_DRAWITEM,
    WM_INITMENUPOPUP, WM_MEASUREITEM, WM_MENUCHAR, WNDCLASSW, WS_POPUP,
  };

  use base64::Engine as _;
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

  fn is_real_bitmap(handle: HBITMAP) -> bool {
    !handle.0.is_null() && (handle.0 as isize) != -1 && (handle.0 as usize) > 16
  }

  fn is_callback_bitmap(handle: HBITMAP) -> bool {
    (handle.0 as isize) == -1
  }

  fn colorref_to_rgb(color: u32) -> [u8; 3] {
    [(color & 0xFF) as u8, ((color >> 8) & 0xFF) as u8, ((color >> 16) & 0xFF) as u8]
  }

  fn unpremultiply_channel(channel: u8, alpha: u8) -> u8 {
    ((u16::from(channel) * 255 + u16::from(alpha) / 2) / u16::from(alpha)).min(255) as u8
  }

  pub(super) fn bgra_to_icon_rgba(
    bgra: &[u8],
    width: u32,
    height: u32,
    legacy_bg_colors: &[[u8; 3]],
  ) -> Option<Vec<u8>> {
    let pixel_count = (width as usize).checked_mul(height as usize)?;
    if bgra.len() < pixel_count * 4 || pixel_count == 0 {
      return None;
    }
    let pixels = &bgra[..pixel_count * 4];
    let has_alpha = pixels.chunks_exact(4).any(|p| p[3] > 0);
    let mut rgba = vec![0u8; pixel_count * 4];

    if has_alpha {
      let is_premultiplied = pixels
        .chunks_exact(4)
        .all(|p| p[0] <= p[3] && p[1] <= p[3] && p[2] <= p[3]);
      let mut visible = 0usize;
      for (idx, p) in pixels.chunks_exact(4).enumerate() {
        let a = p[3];
        if a == 0 {
          continue;
        }
        visible += 1;
        let out = idx * 4;
        if is_premultiplied && a < 255 {
          rgba[out] = unpremultiply_channel(p[2], a);
          rgba[out + 1] = unpremultiply_channel(p[1], a);
          rgba[out + 2] = unpremultiply_channel(p[0], a);
        } else {
          rgba[out] = p[2];
          rgba[out + 1] = p[1];
          rgba[out + 2] = p[0];
        }
        rgba[out + 3] = a;
      }
      return (visible >= 1).then_some(rgba);
    }

    /* Legacy 24bpp/DDB bitmap with alpha=0 everywhere. */
    if pixels.chunks_exact(4).all(|p| p[0] == 0 && p[1] == 0 && p[2] == 0) {
      return None;
    }
    for (idx, p) in pixels.chunks_exact(4).enumerate() {
      let out = idx * 4;
      rgba[out] = p[2];
      rgba[out + 1] = p[1];
      rgba[out + 2] = p[0];
      rgba[out + 3] = 255;
    }

    let w = width as usize;
    let h = height as usize;
    let corner_indices = [0, w - 1, (h - 1) * w, h * w - 1];
    let pixel_rgb = |buf: &[u8], idx: usize| -> [u8; 3] { [buf[idx * 4], buf[idx * 4 + 1], buf[idx * 4 + 2]] };
    let matched_bg = legacy_bg_colors.iter().copied().find(|candidate| {
      corner_indices.iter().filter(|&&idx| pixel_rgb(&rgba, idx) == *candidate).count() >= 3
    });

    if let Some(bg) = matched_bg {
      let mut visited = vec![false; pixel_count];
      let mut queue = VecDeque::new();
      for &idx in &corner_indices {
        if pixel_rgb(&rgba, idx) == bg && !visited[idx] {
          visited[idx] = true;
          queue.push_back(idx);
        }
      }
      /* Seed any matching edge pixel so separated border regions also clear. */
      for x in 0..w {
        for idx in [x, (h - 1) * w + x] {
          if pixel_rgb(&rgba, idx) == bg && !visited[idx] {
            visited[idx] = true;
            queue.push_back(idx);
          }
        }
      }
      for y in 0..h {
        for idx in [y * w, y * w + (w - 1)] {
          if pixel_rgb(&rgba, idx) == bg && !visited[idx] {
            visited[idx] = true;
            queue.push_back(idx);
          }
        }
      }
      while let Some(idx) = queue.pop_front() {
        rgba[idx * 4] = 0;
        rgba[idx * 4 + 1] = 0;
        rgba[idx * 4 + 2] = 0;
        rgba[idx * 4 + 3] = 0;
        let x = idx % w;
        let y = idx / w;
        let neighbors = [
          (x > 0).then(|| idx - 1),
          (x + 1 < w).then(|| idx + 1),
          (y > 0).then(|| idx - w),
          (y + 1 < h).then(|| idx + w),
        ];
        for n in neighbors.into_iter().flatten() {
          if !visited[n] && pixel_rgb(&rgba, n) == bg {
            visited[n] = true;
            queue.push_back(n);
          }
        }
      }
    }

    let visible = rgba.chunks_exact(4).filter(|p| p[3] > 0).count();
    (visible >= 3).then_some(rgba)
  }

  pub(super) fn matte_black_and_white_bgra(on_black: &[u8], on_white: &[u8]) -> Option<Vec<u8>> {
    if on_black.len() != on_white.len() || on_black.len() % 4 != 0 || on_black.is_empty() {
      return None;
    }
    let mut rgba = vec![0u8; on_black.len()];
    let mut visible = 0usize;
    for (idx, (b, w)) in on_black.chunks_exact(4).zip(on_white.chunks_exact(4)).enumerate() {
      let diff_b = w[0].saturating_sub(b[0]);
      let diff_g = w[1].saturating_sub(b[1]);
      let diff_r = w[2].saturating_sub(b[2]);
      let transparency = ((u16::from(diff_r) + u16::from(diff_g) + u16::from(diff_b) + 1) / 3).min(255) as u8;
      let alpha = 255 - transparency;
      if alpha == 0 {
        continue;
      }
      visible += 1;
      let out = idx * 4;
      if alpha == 255 {
        rgba[out] = b[2];
        rgba[out + 1] = b[1];
        rgba[out + 2] = b[0];
      } else {
        rgba[out] = unpremultiply_channel(b[2], alpha);
        rgba[out + 1] = unpremultiply_channel(b[1], alpha);
        rgba[out + 2] = unpremultiply_channel(b[0], alpha);
      }
      rgba[out + 3] = alpha;
    }
    (visible >= 3).then_some(rgba)
  }

  fn encode_icon_png(rgba: &[u8], width: u32, height: u32) -> Option<String> {
    let image = image::RgbaImage::from_raw(width, height, rgba.to_vec())?;
    let mut png = Vec::new();
    image::DynamicImage::ImageRgba8(image)
      .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
      .ok()?;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
  }

  /* Converts a real HBITMAP attached to a menu item into a base64 PNG without taking ownership of it. */
  unsafe fn bitmap_to_icon_png(hbitmap: HBITMAP) -> Option<String> {
    let (width, height, bgra) = crate::windows_file_icons::read_bitmap_bgra(hbitmap)?;
    if width == 0 || height == 0 || width > 256 || height > 256 {
      return None;
    }
    let legacy_bg_colors = [
      colorref_to_rgb(GetSysColor(COLOR_MENU)),
      colorref_to_rgb(GetSysColor(COLOR_BTNFACE)),
      [240, 240, 240],
      [192, 192, 192],
      [255, 0, 255],
    ];
    let rgba = bgra_to_icon_rgba(&bgra, width, height, &legacy_bg_colors)?;
    encode_icon_png(&rgba, width, height)
  }

  struct IconCaptureContext {
    cm2: Option<IContextMenu2>,
    cm3: Option<IContextMenu3>,
    dc: HDC,
    bitmap: HBITMAP,
    old_bitmap: HGDIOBJ,
    bits: *mut std::ffi::c_void,
    canvas_size: i32,
    default_icon_w: u32,
    default_icon_h: u32,
  }

  impl IconCaptureContext {
    unsafe fn handle_menu_msg(&self, msg: u32, wparam: WPARAM, lparam: LPARAM) -> bool {
      if let Some(cm3) = self.cm3.as_ref() {
        let mut res = LRESULT(0);
        if cm3.HandleMenuMsg2(msg, wparam, lparam, Some(&mut res)).is_ok() {
          return true;
        }
      }
      if let Some(cm2) = self.cm2.as_ref() {
        return cm2.HandleMenuMsg(msg, wparam, lparam).is_ok();
      }
      false
    }
  }

  impl Drop for IconCaptureContext {
    fn drop(&mut self) {
      unsafe {
        if !self.old_bitmap.is_invalid() {
          let _ = SelectObject(self.dc, self.old_bitmap);
        }
        let _ = DeleteObject(HGDIOBJ(self.bitmap.0));
        let _ = DeleteDC(self.dc);
      }
    }
  }

  unsafe fn create_icon_capture(
    cm2: Option<IContextMenu2>,
    cm3: Option<IContextMenu3>,
  ) -> Result<IconCaptureContext, String> {
    let default_icon_w = GetSystemMetrics(SM_CXSMICON).max(16) as u32;
    let default_icon_h = GetSystemMetrics(SM_CYSMICON).max(16) as u32;
    let canvas_size = (default_icon_w.max(default_icon_h) as i32).max(64);
    let dc = CreateCompatibleDC(None);
    if dc.is_invalid() {
      return Err("CreateCompatibleDC failed".to_string());
    }
    let mut bitmap_info = BITMAPINFO::default();
    bitmap_info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
    bitmap_info.bmiHeader.biWidth = canvas_size;
    bitmap_info.bmiHeader.biHeight = -canvas_size; /* Top-down. */
    bitmap_info.bmiHeader.biPlanes = 1;
    bitmap_info.bmiHeader.biBitCount = 32;
    bitmap_info.bmiHeader.biCompression = BI_RGB.0;
    let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
    let bitmap = CreateDIBSection(Some(dc), &bitmap_info, DIB_RGB_COLORS, &mut bits, None, 0)
      .map_err(|error| {
        let _ = DeleteDC(dc);
        format!("CreateDIBSection failed: {error}")
      })?;
    let old_bitmap = SelectObject(dc, HGDIOBJ(bitmap.0));
    Ok(IconCaptureContext {
      cm2,
      cm3,
      dc,
      bitmap,
      old_bitmap,
      bits,
      canvas_size,
      default_icon_w,
      default_icon_h,
    })
  }

  unsafe fn copy_capture_subrect(capture: &IconCaptureContext, width: u32, height: u32) -> Vec<u8> {
    let canvas_stride = capture.canvas_size as usize * 4;
    let row_bytes = width as usize * 4;
    let src = std::slice::from_raw_parts(capture.bits as *const u8, canvas_stride * capture.canvas_size as usize);
    let mut out = vec![0u8; row_bytes * height as usize];
    for y in 0..height as usize {
      let src_start = y * canvas_stride;
      let dst_start = y * row_bytes;
      out[dst_start..dst_start + row_bytes].copy_from_slice(&src[src_start..src_start + row_bytes]);
    }
    out
  }

  /* Captures the icon of an HBMMENU_CALLBACK item via WM_MEASUREITEM + WM_DRAWITEM
     onto an offscreen 32bpp DIB using two-background difference matting when needed. */
  unsafe fn capture_callback_icon(
    capture: &IconCaptureContext,
    w_id: u32,
    item_data: usize,
    parent_menu: HMENU,
  ) -> Option<String> {
    if capture.cm3.is_none() && capture.cm2.is_none() {
      return None;
    }

    let mut measure = MEASUREITEMSTRUCT {
      CtlType: ODT_MENU,
      CtlID: 0,
      itemID: w_id,
      itemWidth: 0,
      itemHeight: 0,
      itemData: item_data,
    };
    let _ = capture.handle_menu_msg(
      WM_MEASUREITEM,
      WPARAM(0),
      LPARAM(&mut measure as *mut MEASUREITEMSTRUCT as isize),
    );
    let max_size = capture.canvas_size as u32;
    let icon_w = if measure.itemWidth > 0 && measure.itemWidth <= max_size {
      measure.itemWidth
    } else {
      capture.default_icon_w
    };
    let icon_h = if measure.itemHeight > 0 && measure.itemHeight <= max_size {
      measure.itemHeight
    } else {
      capture.default_icon_h
    };

    let canvas_bytes = (capture.canvas_size * capture.canvas_size) as usize * 4;
    let draw_item = DRAWITEMSTRUCT {
      CtlType: ODT_MENU,
      CtlID: 0,
      itemID: w_id,
      itemAction: ODA_DRAWENTIRE,
      itemState: ODS_FLAGS(0),
      hwndItem: HWND(parent_menu.0),
      hDC: capture.dc,
      rcItem: RECT { left: 0, top: 0, right: icon_w as i32, bottom: icon_h as i32 },
      itemData: item_data,
    };

    /* Pass 1: black/transparent canvas. */
    std::ptr::write_bytes(capture.bits as *mut u8, 0, canvas_bytes);
    if !capture.handle_menu_msg(
      WM_DRAWITEM,
      WPARAM(0),
      LPARAM(&draw_item as *const DRAWITEMSTRUCT as isize),
    ) {
      return None;
    }
    let _ = GdiFlush();
    let on_black = copy_capture_subrect(capture, icon_w, icon_h);
    if on_black.chunks_exact(4).any(|p| p[3] > 0) {
      if let Some(rgba) = bgra_to_icon_rgba(&on_black, icon_w, icon_h, &[]) {
        return encode_icon_png(&rgba, icon_w, icon_h);
      }
    }

    /* Pass 2: white canvas for two-background alpha matting. */
    std::ptr::write_bytes(capture.bits as *mut u8, 0xFF, canvas_bytes);
    let _ = PatBlt(capture.dc, 0, 0, capture.canvas_size, capture.canvas_size, WHITENESS);
    if !capture.handle_menu_msg(
      WM_DRAWITEM,
      WPARAM(0),
      LPARAM(&draw_item as *const DRAWITEMSTRUCT as isize),
    ) {
      return None;
    }
    let _ = GdiFlush();
    let on_white = copy_capture_subrect(capture, icon_w, icon_h);
    let rgba = matte_black_and_white_bgra(&on_black, &on_white)?;
    encode_icon_png(&rgba, icon_w, icon_h)
  }

  unsafe fn extract_entry_icon(
    capture: &IconCaptureContext,
    info: &MENUITEMINFOW,
    checked: bool,
    parent_menu: HMENU,
  ) -> Option<String> {
    if is_real_bitmap(info.hbmpItem) {
      return bitmap_to_icon_png(info.hbmpItem);
    }
    if is_callback_bitmap(info.hbmpItem) {
      return capture_callback_icon(capture, info.wID, info.dwItemData, parent_menu);
    }
    let fallback = if checked { info.hbmpChecked } else { info.hbmpUnchecked };
    if is_real_bitmap(fallback) {
      return bitmap_to_icon_png(fallback);
    }
    None
  }

  unsafe fn walk_shell_menu(hmenu: HMENU, capture: &IconCaptureContext, depth: u8) -> Vec<ShellMenuEntry> {
    if depth >= 8 {
      return Vec::new();
    }
    let count = GetMenuItemCount(Some(hmenu));
    let mut entries = Vec::new();
    for index in 0..count.max(0) as u32 {
      let mut info = MENUITEMINFOW {
        cbSize: std::mem::size_of::<MENUITEMINFOW>() as u32,
        fMask: MENU_ITEM_MASK(
          MIIM_FTYPE.0
            | MIIM_ID.0
            | MIIM_SUBMENU.0
            | MIIM_STATE.0
            | MIIM_BITMAP.0
            | MIIM_CHECKMARKS.0
            | MIIM_DATA.0,
        ),
        ..Default::default()
      };
      if GetMenuItemInfoW(hmenu, index, true, &mut info).is_err() {
        continue;
      }
      if (info.fType.0 & MFT_SEPARATOR.0) != 0 {
        entries.push(ShellMenuEntry { kind: "separator".to_string(), icon: None, label: None, verb_id: None, disabled: false, checked: false, items: None });
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
      let icon = extract_entry_icon(capture, &info, checked, hmenu);
      if !info.hSubMenu.is_invalid() {
        let _ = capture.handle_menu_msg(
          WM_INITMENUPOPUP,
          WPARAM(info.hSubMenu.0 as usize),
          LPARAM(index as isize),
        );
        entries.push(ShellMenuEntry {
          kind: "submenu".to_string(),
          icon,
          label: Some(label),
          verb_id: None,
          disabled,
          checked,
          items: Some(walk_shell_menu(info.hSubMenu, capture, depth + 1)),
        });
        continue;
      }
      if info.wID < MENU_ID_FIRST || info.wID > MENU_ID_LAST {
        continue;
      }
      entries.push(ShellMenuEntry {
        kind: "entry".to_string(),
        icon,
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
    let cm2: Option<IContextMenu2> = context_menu.cast().ok();
    let cm3: Option<IContextMenu3> = context_menu.cast().ok();
    let capture = match create_icon_capture(cm2, cm3) {
      Ok(capture) => capture,
      Err(error) => {
        let _ = DestroyMenu(hmenu);
        return Err(error);
      }
    };
    let _ = capture.handle_menu_msg(WM_INITMENUPOPUP, WPARAM(hmenu.0 as usize), LPARAM(0));
    let items = walk_shell_menu(hmenu, &capture, 0);
    drop(capture);
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

#[cfg(all(test, target_os = "windows"))]
mod tests {
  use super::windows_impl::{bgra_to_icon_rgba, matte_black_and_white_bgra};
  use super::{build_shell_context_menu, drop_shell_context_menu, ShellMenuEntry};
  use base64::Engine as _;

  #[test]
  fn bgra_to_icon_rgba_unpremultiplies_premultiplied_alpha() {
    // 2x2 BGRA with premultiplied 50% alpha red, opaque green, transparent, and 50% alpha blue.
    let bgra = [
      0, 0, 64, 128,   // R=128, G=0, B=0, A=128 (premultiplied R=64)
      0, 255, 0, 255,  // R=0, G=255, B=0, A=255
      0, 0, 0, 0,      // transparent
      64, 0, 0, 128,   // R=0, G=0, B=128, A=128 (premultiplied B=64)
    ];
    let rgba = bgra_to_icon_rgba(&bgra, 2, 2, &[]).expect("expected valid rgba");
    assert_eq!(&rgba[0..4], &[128, 0, 0, 128]);
    assert_eq!(&rgba[4..8], &[0, 255, 0, 255]);
    assert_eq!(&rgba[8..12], &[0, 0, 0, 0]);
    assert_eq!(&rgba[12..16], &[0, 0, 128, 128]);
  }

  #[test]
  fn bgra_to_icon_rgba_preserves_straight_alpha() {
    // When any channel exceeds alpha, it is straight alpha (no unpremultiplication).
    let bgra = [
      0, 0, 200, 100, // R=200 > A=100 -> straight
      0, 255, 0, 255,
      0, 0, 0, 0,
      255, 0, 0, 255,
    ];
    let rgba = bgra_to_icon_rgba(&bgra, 2, 2, &[]).expect("expected valid rgba");
    assert_eq!(&rgba[0..4], &[200, 0, 0, 100]);
    assert_eq!(&rgba[4..8], &[0, 255, 0, 255]);
  }

  #[test]
  fn bgra_to_icon_rgba_flood_fills_legacy_background_preserving_interior() {
    // 5x5 opaque legacy bitmap (alpha=0) with [240, 240, 240] background,
    // a solid 1-pixel ring of dark pixels around an enclosed interior [240, 240, 240] pixel.
    let bg = [240u8, 240, 240, 0];
    let fg = [20u8, 20, 20, 0];
    let mut bgra5 = Vec::new();
    for y in 0..5 {
      for x in 0..5 {
        let is_outer = x == 0 || y == 0 || x == 4 || y == 4;
        let is_center = x == 2 && y == 2;
        if is_outer || is_center {
          bgra5.extend_from_slice(&bg);
        } else {
          bgra5.extend_from_slice(&fg);
        }
      }
    }
    let rgba = bgra_to_icon_rgba(&bgra5, 5, 5, &[[240, 240, 240]]).expect("expected valid rgba");
    // Outer corners cleared:
    assert_eq!(rgba[3], 0);
    assert_eq!(rgba[(4 * 5 + 4) * 4 + 3], 0);
    // Foreground ring opaque:
    assert_eq!(&rgba[(1 * 5 + 1) * 4..(1 * 5 + 1) * 4 + 4], &[20, 20, 20, 255]);
    // Enclosed interior pixel with same RGB as bg stays opaque:
    assert_eq!(&rgba[(2 * 5 + 2) * 4..(2 * 5 + 2) * 4 + 4], &[240, 240, 240, 255]);
  }

  #[test]
  fn matte_black_and_white_bgra_recovers_alpha_and_color() {
    // Pixel 0: opaque white (on_black=255, on_white=255 -> alpha=255, white)
    // Pixel 1: opaque black (on_black=0, on_white=0 -> alpha=255, black)
    // Pixel 2: transparent (on_black=0, on_white=255 -> alpha=0)
    // Pixel 3: ~50% alpha red (alpha=128 -> on_black=[0,0,128], on_white=[127,127,255])
    let on_black = [
      255, 255, 255, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 128, 0,
    ];
    let on_white = [
      255, 255, 255, 0,
      0, 0, 0, 0,
      255, 255, 255, 0,
      127, 127, 255, 0,
    ];
    let rgba = matte_black_and_white_bgra(&on_black, &on_white).expect("expected matted rgba");
    assert_eq!(&rgba[0..4], &[255, 255, 255, 255]);
    assert_eq!(&rgba[4..8], &[0, 0, 0, 255]);
    assert_eq!(&rgba[8..12], &[0, 0, 0, 0]);
    assert_eq!(rgba[15], 128);
    assert!((rgba[12] as i32 - 255).abs() <= 1);
    assert_eq!(rgba[13], 0);
    assert_eq!(rgba[14], 0);
  }

  fn collect_icon_stats(entries: &[ShellMenuEntry]) -> (usize, usize, Vec<&str>) {
    let mut total = 0usize;
    let mut with_icon = 0usize;
    let mut icons = Vec::new();
    for entry in entries {
      if entry.kind != "separator" {
        total += 1;
        if let Some(icon) = entry.icon.as_deref() {
          with_icon += 1;
          icons.push(icon);
        }
      }
      if let Some(sub) = entry.items.as_deref() {
        let (st, sw, si) = collect_icon_stats(sub);
        total += st;
        with_icon += sw;
        icons.extend(si);
      }
    }
    (total, with_icon, icons)
  }

  #[test]
  fn live_windows_shell_menu_captures_valid_png_icons() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let sample_file = format!("{manifest_dir}\\Cargo.toml");
    let sample_dir = format!("{manifest_dir}");
    let mut total_icons = 0usize;

    for target in [&sample_file, &sample_dir, "C:\\Windows\\notepad.exe", "C:\\Windows"] {
      if !std::path::Path::new(target).exists() {
        continue;
      }
      let built = build_shell_context_menu(&[target.to_string()], 100, 100)
        .expect("build_shell_context_menu should succeed");
      let (total, with_icon, icons) = collect_icon_stats(&built.items);
      eprintln!("[shell-menu-test] target={target} entries={total} with_icon={with_icon}");
      assert!(total > 0, "expected non-empty menu for {target}");
      for data_url in icons {
        let b64 = data_url
          .strip_prefix("data:image/png;base64,")
          .expect("icon must be PNG data URL");
        let bytes = base64::engine::general_purpose::STANDARD
          .decode(b64)
          .expect("icon base64 must decode");
        let img = image::load_from_memory(&bytes).expect("icon bytes must be valid PNG");
        assert!(img.width() > 0 && img.height() > 0);
      }
      total_icons += with_icon;
      drop_shell_context_menu(built.token);
    }

    assert!(total_icons > 0, "expected at least one captured Shell menu icon across test targets");
  }
}
