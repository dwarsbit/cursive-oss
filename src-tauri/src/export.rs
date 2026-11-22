use std::path::PathBuf;
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_dialog::DialogExt;

/// The kinds of file an export may be saved as, with the name the save
/// dialog gives each.
const KINDS: [(&str, &str); 4] = [
    ("pptx", "PowerPoint"),
    ("docx", "Word"),
    ("html", "HTML"),
    ("zip", "ZIP"),
];

/// The file an export saved last, for "Show in folder".
#[derive(Default)]
pub struct LastExport(Mutex<Option<PathBuf>>);

/// Saves an export where the reader picks, in the system's save dialog.
/// The page sends the file's bytes, with its name and extension in the
/// `x-name` and `x-extension` headers; only the dialog chooses where it
/// goes, so the window can't write anywhere else. Gives the saved file's
/// name, or nothing when the reader cancels.
#[tauri::command]
pub async fn export_save(
    app: tauri::AppHandle,
    last: tauri::State<'_, LastExport>,
    request: Request<'_>,
) -> Result<Option<String>, String> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned)
    };
    let extension = header("x-extension").unwrap_or_default();
    let Some((_, kind)) = KINDS.iter().find(|(ext, _)| *ext == extension) else {
        return Err("Cursive can't save this kind of file.".into());
    };
    let name = header("x-name")
        .map(|name| {
            percent_encoding::percent_decode_str(&name)
                .decode_utf8_lossy()
                .into_owned()
        })
        .unwrap_or_else(|| "Export".into());
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Cursive couldn't read the file to save.".into());
    };
    let Some(path) = pick(&app, &name, &extension, kind) else {
        return Ok(None);
    };
    std::fs::write(&path, bytes)
        .map_err(|e| format!("Cursive couldn't save {}: {e}", path.display()))?;
    remember(&last, path).map(Some)
}

/// Where the reader wants the export, from the system's save dialog, with
/// the extension added when the dialog left it off. Nothing when they cancel.
pub(crate) fn pick(
    app: &tauri::AppHandle,
    name: &str,
    extension: &str,
    kind: &str,
) -> Option<PathBuf> {
    let picked = app
        .dialog()
        .file()
        .set_title("Export")
        .set_file_name(format!("{name}.{extension}"))
        .add_filter(kind, &[extension])
        .blocking_save_file()?;
    Some(with_extension(picked.into_path().ok()?, extension))
}

/// Keeps the saved file for "Show in folder" and gives its name.
pub(crate) fn remember(last: &LastExport, path: PathBuf) -> Result<String, String> {
    let saved = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    *last.0.lock().map_err(|e| e.to_string())? = Some(path);
    Ok(saved)
}

/// Shows the file the last export saved in the system's file manager.
#[tauri::command]
pub fn export_reveal(last: tauri::State<'_, LastExport>) -> Result<(), String> {
    let path = last
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Nothing has been exported yet.")?;
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
}

/// The path with the extension, when the dialog left it off.
fn with_extension(path: PathBuf, extension: &str) -> PathBuf {
    let has = path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case(extension));
    if has {
        path
    } else {
        let mut name = path.file_name().unwrap_or_default().to_os_string();
        name.push(".");
        name.push(extension);
        path.with_file_name(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_a_missing_extension() {
        assert_eq!(
            with_extension(PathBuf::from("/a/Talk"), "pptx"),
            PathBuf::from("/a/Talk.pptx")
        );
        assert_eq!(
            with_extension(PathBuf::from("/a/Talk.PPTX"), "pptx"),
            PathBuf::from("/a/Talk.PPTX")
        );
        assert_eq!(
            with_extension(PathBuf::from("/a/Notes.v2"), "docx"),
            PathBuf::from("/a/Notes.v2.docx")
        );
    }
}
