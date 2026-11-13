//! Workbook file commands (AD-7). Reads and writes are scoped to `.xlsx`
//! files chosen through the dialog plugin; there is no filesystem plugin.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use base64::Engine as _;
use serde::Serialize;

use crate::error::AppError;

const XLSX_EXTENSION: &str = "xlsx";
/// Chat attachments are read into memory and sent as base64 over IPC. 5 MB
/// matches the strictest per-image limit among the supported providers.
const MAX_ATTACHMENT_BYTES: u64 = 5 * 1024 * 1024;
#[cfg(windows)]
const ERROR_SHARING_VIOLATION: i32 = 32;
#[cfg(windows)]
const ERROR_LOCK_VIOLATION: i32 = 33;
#[cfg(windows)]
const ERROR_ACCESS_DENIED: i32 = 5;

/// Validate a user-picked workbook path. Only `.xlsx` files are accepted.
pub(crate) fn validate_workbook_path(path: &Path) -> Result<(), AppError> {
    if path.as_os_str().is_empty() {
        return Err(AppError::InvalidPath("path is empty".into()));
    }
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case(XLSX_EXTENSION) {
        return Err(AppError::InvalidPath(format!(
            "expected a .xlsx file, got: {}",
            path.display()
        )));
    }
    Ok(())
}

/// Sibling temp file used for the atomic save. Same directory so the final
/// rename stays on one volume.
pub(crate) fn temp_path_for(target: &Path) -> PathBuf {
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "workbook.xlsx".to_string());
    let suffix = format!("{:016x}", rand::random::<u64>());
    target.with_file_name(format!(".{name}.tmp-{suffix}"))
}

/// Map an I/O failure to a user-facing error, detecting Windows sharing and
/// lock violations so Excel's "file in use" case is actionable.
pub(crate) fn map_io_error(err: &io::Error, path: &Path) -> AppError {
    if err.kind() == io::ErrorKind::NotFound {
        return AppError::NotFound(path.display().to_string());
    }
    #[cfg(windows)]
    {
        // 32/33 are the classic sharing/lock violations. Windows also reports
        // 5 (access denied) when renaming over a workbook another process has
        // open without delete sharing (Excel does this); only treat it as a
        // lock when the target exists, so a read-only folder stays an I/O
        // error.
        let locked = matches!(
            err.raw_os_error(),
            Some(ERROR_SHARING_VIOLATION | ERROR_LOCK_VIOLATION)
        ) || (err.raw_os_error() == Some(ERROR_ACCESS_DENIED) && path.exists());
        if locked {
            return AppError::FileLocked(path.display().to_string());
        }
    }
    AppError::Io(format!("{}: {err}", path.display()))
}

/// Write `target` atomically: temp file in the same directory, fsync, rename.
/// The temp file is removed on any failure, leaving an existing target intact.
pub(crate) fn atomic_write_with<F>(target: &Path, write_fn: F) -> io::Result<()>
where
    F: FnOnce(&mut File) -> io::Result<()>,
{
    let temp = temp_path_for(target);
    let result = (|| -> io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        write_fn(&mut file)?;
        file.flush()?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, target)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn decode_base64(encoded: &str) -> Result<Vec<u8>, AppError> {
    base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|err| AppError::Io(format!("invalid base64 payload: {err}")))
}

#[tauri::command]
#[specta::specta]
pub async fn read_workbook(path: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        validate_workbook_path(&path)?;
        if !path.is_file() {
            return Err(AppError::NotFound(path.display().to_string()));
        }
        let bytes = fs::read(&path).map_err(|err| map_io_error(&err, &path))?;
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    })
    .await
    .map_err(|err| AppError::Io(format!("read task failed: {err}")))?
}

#[tauri::command]
#[specta::specta]
pub async fn save_workbook(path: String, base64: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        validate_workbook_path(&path)?;
        let bytes = decode_base64(&base64)?;
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            if !parent.is_dir() {
                return Err(AppError::InvalidPath(format!(
                    "destination folder does not exist: {}",
                    parent.display()
                )));
            }
        }
        atomic_write_with(&path, |file| file.write_all(&bytes))
            .map_err(|err| map_io_error(&err, &path))?;
        Ok(())
    })
    .await
    .map_err(|err| AppError::Io(format!("save task failed: {err}")))?
}

/// One image/PDF read for an AI chat message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentPayload {
    pub media_type: String,
    pub base64: String,
}

/// Media types the model providers accept as file parts.
fn attachment_media_type(path: &Path) -> Result<&'static str, AppError> {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" => Ok("image/png"),
        "jpg" | "jpeg" => Ok("image/jpeg"),
        "webp" => Ok("image/webp"),
        "gif" => Ok("image/gif"),
        "pdf" => Ok("application/pdf"),
        _ => Err(AppError::InvalidPath(
            "expected a PNG, JPEG, WEBP, GIF, or PDF file".into(),
        )),
    }
}

/// Read a user-picked image or PDF for the AI drawer. Paths come from the
/// dialog plugin; the extension whitelist and size cap are the trust boundary.
fn read_attachment_payload(path: &Path) -> Result<AttachmentPayload, AppError> {
    let media_type = attachment_media_type(path)?;
    if !path.is_file() {
        return Err(AppError::NotFound(path.display().to_string()));
    }
    let metadata = fs::metadata(path).map_err(|err| map_io_error(&err, path))?;
    if metadata.len() > MAX_ATTACHMENT_BYTES {
        return Err(AppError::InvalidPath(format!(
            "attachment is larger than {} MB",
            MAX_ATTACHMENT_BYTES / (1024 * 1024)
        )));
    }
    let bytes = fs::read(path).map_err(|err| map_io_error(&err, path))?;
    Ok(AttachmentPayload {
        media_type: media_type.to_owned(),
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn read_attachment(path: String) -> Result<AttachmentPayload, AppError> {
    tauri::async_runtime::spawn_blocking(move || read_attachment_payload(Path::new(&path)))
        .await
        .map_err(|err| AppError::Io(format!("read task failed: {err}")))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::ErrorKind;

    #[test]
    fn accepts_xlsx_case_insensitively() {
        assert!(validate_workbook_path(Path::new("C:/forms/survey.xlsx")).is_ok());
        assert!(validate_workbook_path(Path::new("C:/forms/Survey.XLSX")).is_ok());
    }

    #[test]
    fn rejects_non_xlsx_and_empty_paths() {
        for path in [
            "C:/forms/survey.xls",
            "C:/forms/survey.csv",
            "C:/forms/survey",
        ] {
            match validate_workbook_path(Path::new(path)) {
                Err(AppError::InvalidPath(_)) => {}
                other => panic!("expected InvalidPath for {path}, got {other:?}"),
            }
        }
        assert!(matches!(
            validate_workbook_path(Path::new("")),
            Err(AppError::InvalidPath(_))
        ));
    }

    #[test]
    fn maps_supported_attachment_extensions() {
        for (path, media_type) in [
            ("C:/x/photo.PNG", "image/png"),
            ("C:/x/photo.jpg", "image/jpeg"),
            ("C:/x/photo.jpeg", "image/jpeg"),
            ("C:/x/photo.webp", "image/webp"),
            ("C:/x/photo.gif", "image/gif"),
            ("C:/x/paper.pdf", "application/pdf"),
        ] {
            assert_eq!(
                attachment_media_type(Path::new(path)).unwrap(),
                media_type,
                "unexpected media type for {path}"
            );
        }
    }

    #[test]
    fn rejects_other_attachment_extensions() {
        for path in ["C:/x/notes.txt", "C:/x/photo.svg", "C:/x/attachment"] {
            assert!(matches!(
                attachment_media_type(Path::new(path)),
                Err(AppError::InvalidPath(_))
            ));
        }
    }

    #[test]
    fn reads_a_supported_attachment_as_base64() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("scan.PNG");
        let bytes = b"\x89PNG\r\n\x1a\n";
        fs::write(&path, bytes).unwrap();

        let payload = read_attachment_payload(&path).unwrap();
        assert_eq!(payload.media_type, "image/png");
        assert_eq!(
            base64::engine::general_purpose::STANDARD
                .decode(payload.base64)
                .unwrap(),
            bytes
        );
    }

    #[test]
    fn rejects_an_oversized_attachment() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("huge.pdf");
        File::create(&path)
            .unwrap()
            .set_len(MAX_ATTACHMENT_BYTES + 1)
            .unwrap();
        assert!(matches!(
            read_attachment_payload(&path),
            Err(AppError::InvalidPath(_))
        ));
    }

    #[test]
    fn missing_attachment_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("missing.png");
        assert!(matches!(
            read_attachment_payload(&path),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn temp_file_is_a_sibling_with_a_random_suffix() {
        let target = Path::new("C:/forms/survey.xlsx");
        let temp = temp_path_for(target);
        assert_eq!(temp.parent(), target.parent());
        let name = temp.file_name().unwrap().to_string_lossy();
        assert!(
            name.contains("survey.xlsx.tmp-"),
            "unexpected temp name: {name}"
        );
        assert_ne!(temp, temp_path_for(target));
    }

    #[test]
    fn maps_not_found() {
        let err = io::Error::new(ErrorKind::NotFound, "gone");
        assert!(matches!(
            map_io_error(&err, Path::new("C:/x.xlsx")),
            AppError::NotFound(_)
        ));
    }

    #[test]
    fn maps_generic_io_error() {
        let err = io::Error::new(ErrorKind::PermissionDenied, "nope");
        assert!(matches!(
            map_io_error(&err, Path::new("C:/x.xlsx")),
            AppError::Io(_)
        ));
    }

    #[cfg(windows)]
    #[test]
    fn maps_windows_sharing_violation_to_file_locked() {
        let err = io::Error::from_raw_os_error(ERROR_SHARING_VIOLATION);
        assert!(matches!(
            map_io_error(&err, Path::new("C:/x.xlsx")),
            AppError::FileLocked(_)
        ));
        let err = io::Error::from_raw_os_error(ERROR_LOCK_VIOLATION);
        assert!(matches!(
            map_io_error(&err, Path::new("C:/x.xlsx")),
            AppError::FileLocked(_)
        ));
    }

    #[test]
    fn atomic_write_creates_and_replaces_files() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("form.xlsx");

        atomic_write_with(&target, |file| file.write_all(b"first")).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"first");

        atomic_write_with(&target, |file| file.write_all(b"second")).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"second");

        let leftovers: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
            .collect();
        assert!(leftovers.is_empty(), "temp files were not cleaned up");
    }

    #[test]
    fn failed_write_leaves_the_original_intact() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("form.xlsx");
        fs::write(&target, b"original").unwrap();

        let err = atomic_write_with(&target, |file| {
            file.write_all(b"partial")?;
            Err(io::Error::other("injected failure"))
        })
        .unwrap_err();
        assert_eq!(err.kind(), ErrorKind::Other);
        assert_eq!(fs::read(&target).unwrap(), b"original");

        let leftovers: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp-"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "temp file leaked after a failed write"
        );
    }

    #[cfg(windows)]
    #[test]
    fn writing_over_a_file_locked_by_another_handle_maps_to_file_locked() {
        use std::os::windows::fs::OpenOptionsExt;

        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("form.xlsx");
        fs::write(&target, b"original").unwrap();
        // Share mode 0 = the same exclusive lock Excel takes while a workbook
        // is open; renaming over it fails with ERROR_SHARING_VIOLATION.
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0)
            .open(&target)
            .unwrap();

        let err = atomic_write_with(&target, |file| file.write_all(b"new")).unwrap_err();
        assert!(
            matches!(map_io_error(&err, &target), AppError::FileLocked(_)),
            "unexpected error: kind={:?} raw={:?}",
            err.kind(),
            err.raw_os_error()
        );
        drop(lock);
        assert_eq!(fs::read(&target).unwrap(), b"original");
    }

    #[cfg(windows)]
    #[test]
    fn access_denied_for_a_missing_target_is_not_a_lock() {
        let err = io::Error::from_raw_os_error(ERROR_ACCESS_DENIED);
        assert!(matches!(
            map_io_error(&err, Path::new("C:/definitely/missing/form.xlsx")),
            AppError::Io(_)
        ));
    }

    #[test]
    fn base64_round_trips_bytes() {
        let bytes = b"PK\x03\x04 workbook";
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        assert_eq!(decode_base64(&encoded).unwrap(), bytes);
        assert!(matches!(
            decode_base64("not base64!!"),
            Err(AppError::Io(_))
        ));
    }
}
