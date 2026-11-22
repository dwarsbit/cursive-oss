//! Saves an export as a PDF with no print window: the app's own webview
//! prints its pages to the file the reader picks. The page has drawn the
//! export for print, as it does for the print window, and set its sheet
//! size; each system's webview then prints to a file in its own way.

use std::path::Path;
use std::time::Duration;

use serde::Deserialize;
use tokio::sync::oneshot;

use crate::export::{pick, remember, LastExport};

/// The sheet the export prints on, in millimetres.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Sheet {
    pub width: f64,
    pub height: f64,
    /// Top, right, bottom, left.
    pub margin: [f64; 4],
}

impl Sheet {
    fn valid(&self) -> bool {
        let size = |v: f64| v.is_finite() && (50.0..=1000.0).contains(&v);
        let margin = |v: f64| v.is_finite() && (0.0..=50.0).contains(&v);
        size(self.width) && size(self.height) && self.margin.iter().all(|&m| margin(m))
    }
}

/// Longest a print may take: a long project with many images is slow.
const TIMEOUT: Duration = Duration::from_secs(300);

/// Asks where to save the PDF, then prints the window's pages to it.
/// Gives the saved file's name, or nothing when the reader cancels.
#[tauri::command]
pub async fn export_pdf(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    last: tauri::State<'_, LastExport>,
    name: String,
    sheet: Sheet,
) -> Result<Option<String>, String> {
    if !sheet.valid() {
        return Err("Cursive can't print on a sheet of that size.".into());
    }
    let dialog = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || pick(&dialog, &name, "pdf", "PDF"))
        .await
        .map_err(|e| e.to_string())?;
    let Some(path) = picked else {
        return Ok(None);
    };
    // A file from before would hide a print that wrote nothing.
    let _ = std::fs::remove_file(&path);
    let (done, printed) = oneshot::channel();
    let target = path.clone();
    window
        .with_webview(move |webview| print(webview, &target, sheet, done))
        .map_err(|e| e.to_string())?;
    let outcome = match tokio::time::timeout(TIMEOUT, printed).await {
        Ok(Ok(outcome)) => outcome,
        Ok(Err(_)) => Err("The print stopped before it finished.".into()),
        Err(_) => Err("The print took too long.".into()),
    };
    let written = std::fs::metadata(&path).is_ok_and(|meta| meta.len() > 0);
    if let Err(error) = outcome.and_then(|()| {
        written
            .then_some(())
            .ok_or_else(|| "The PDF came out empty.".to_string())
    }) {
        let _ = std::fs::remove_file(&path);
        return Err(format!("Cursive couldn't save the PDF: {error}"));
    }
    remember(&last, path).map(Some)
}

type Done = oneshot::Sender<Result<(), String>>;

const MM_PER_INCH: f64 = 25.4;
const POINTS_PER_INCH: f64 = 72.0;

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn points(mm: f64) -> f64 {
    mm / MM_PER_INCH * POINTS_PER_INCH
}

#[cfg_attr(not(windows), allow(dead_code))]
fn inches(mm: f64) -> f64 {
    mm / MM_PER_INCH
}

/// WebKitGTK prints through GTK's printing, to its "Print to File" printer.
#[cfg(target_os = "linux")]
fn print(webview: tauri::webview::PlatformWebview, path: &Path, sheet: Sheet, done: Done) {
    use std::cell::RefCell;

    use webkit2gtk::PrintOperationExt;

    thread_local! {
        /// The print running now, kept alive until it ends.
        static RUNNING: RefCell<Option<webkit2gtk::PrintOperation>> = const { RefCell::new(None) };
    }

    let uri = match gtk::glib::filename_to_uri(path, None) {
        Ok(uri) => uri,
        Err(error) => {
            let _ = done.send(Err(error.to_string()));
            return;
        }
    };
    let operation = webkit2gtk::PrintOperation::new(&webview.inner());
    let settings = gtk::PrintSettings::new();
    settings.set_printer("Print to File");
    settings.set(gtk::PRINT_SETTINGS_OUTPUT_FILE_FORMAT, Some("pdf"));
    settings.set(gtk::PRINT_SETTINGS_OUTPUT_URI, Some(&uri));
    let paper = gtk::PaperSize::new_custom(
        "cursive-export",
        "Cursive export",
        sheet.width,
        sheet.height,
        gtk::Unit::Mm,
    );
    settings.set_paper_size(&paper);
    let setup = gtk::PageSetup::new();
    setup.set_paper_size(&paper);
    let [top, right, bottom, left] = sheet.margin;
    setup.set_top_margin(top, gtk::Unit::Mm);
    setup.set_right_margin(right, gtk::Unit::Mm);
    setup.set_bottom_margin(bottom, gtk::Unit::Mm);
    setup.set_left_margin(left, gtk::Unit::Mm);
    operation.set_print_settings(&settings);
    operation.set_page_setup(&setup);

    let done = std::rc::Rc::new(RefCell::new(Some(done)));
    let finish = move |outcome: Result<(), String>| {
        if let Some(done) = done.borrow_mut().take() {
            let _ = done.send(outcome);
        }
        RUNNING.with(|running| running.borrow_mut().take());
    };
    let failed = finish.clone();
    operation.connect_failed(move |_, error| failed(Err(error.to_string())));
    operation.connect_finished(move |_| finish(Ok(())));
    RUNNING.with(|running| *running.borrow_mut() = Some(operation.clone()));
    operation.print();
}

/// WebView2 prints to a file by itself.
#[cfg(windows)]
fn print(webview: tauri::webview::PlatformWebview, path: &Path, sheet: Sheet, done: Done) {
    use std::sync::{Arc, Mutex};

    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_7,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let done = Arc::new(Mutex::new(Some(done)));
    let send = {
        let done = done.clone();
        move |outcome: Result<(), String>| {
            if let Some(done) = done.lock().ok().and_then(|mut done| done.take()) {
                let _ = done.send(outcome);
            }
        }
    };
    let finish = send.clone();
    let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
        finish(match result {
            Err(error) => Err(error.message()),
            Ok(()) if !ok => Err("WebView2 couldn't print the pages.".into()),
            Ok(()) => Ok(()),
        });
        Ok(())
    }));
    // Safety: COM calls on the webview Tauri hands over, on its own thread.
    let started = unsafe {
        (|| -> windows::core::Result<()> {
            let core = webview
                .controller()
                .CoreWebView2()?
                .cast::<ICoreWebView2_7>()?;
            let settings = webview
                .environment()
                .cast::<ICoreWebView2Environment6>()?
                .CreatePrintSettings()?;
            settings.SetPageWidth(inches(sheet.width))?;
            settings.SetPageHeight(inches(sheet.height))?;
            let [top, right, bottom, left] = sheet.margin;
            settings.SetMarginTop(inches(top))?;
            settings.SetMarginRight(inches(right))?;
            settings.SetMarginBottom(inches(bottom))?;
            settings.SetMarginLeft(inches(left))?;
            settings.SetScaleFactor(1.0)?;
            settings.SetShouldPrintBackgrounds(true)?;
            settings.SetShouldPrintHeaderAndFooter(false)?;
            core.PrintToPdf(&HSTRING::from(path.as_os_str()), &settings, &handler)
        })()
    };
    if let Err(error) = started {
        send(Err(error.message()));
    }
}

/// WKWebView prints through AppKit's print operation, saving to the file
/// with no print panel.
#[cfg(target_os = "macos")]
fn print(webview: tauri::webview::PlatformWebview, path: &Path, sheet: Sheet, done: Done) {
    macos::print(webview, path, sheet, done)
}

#[cfg(target_os = "macos")]
mod macos {
    use std::cell::RefCell;
    use std::ffi::c_void;
    use std::path::Path;

    use objc2::rc::Retained;
    use objc2::runtime::{Bool, NSObject, ProtocolObject};
    use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob,
        NSPrintingPaginationMode,
    };
    use objc2_foundation::{NSSize, NSString, NSURL};
    use objc2_web_kit::WKWebView;

    use super::{points, Done, Sheet};

    pub struct Ivars {
        done: RefCell<Option<Done>>,
    }

    define_class!(
        /// Hears when the print operation has run.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[ivars = Ivars]
        struct PrintDelegate;

        impl PrintDelegate {
            #[unsafe(method(printOperationDidRun:success:contextInfo:))]
            fn did_run(&self, _operation: &NSPrintOperation, success: Bool, _context: *mut c_void) {
                if let Some(done) = self.ivars().done.borrow_mut().take() {
                    let _ = done.send(if success.as_bool() {
                        Ok(())
                    } else {
                        Err("macOS couldn't print the pages.".into())
                    });
                }
                RUNNING.with(|running| running.borrow_mut().take());
            }
        }
    );

    thread_local! {
        /// The delegate of the print running now: the operation doesn't keep it.
        static RUNNING: RefCell<Option<Retained<PrintDelegate>>> = const { RefCell::new(None) };
    }

    pub fn print(webview: tauri::webview::PlatformWebview, path: &Path, sheet: Sheet, done: Done) {
        let Some(mtm) = MainThreadMarker::new() else {
            let _ = done.send(Err("The print didn't start on the main thread.".into()));
            return;
        };
        // Safety: Tauri hands over its WKWebView, alive while this runs on the main thread.
        let view: &WKWebView = unsafe { &*webview.inner().cast::<WKWebView>() };
        let Some(window) = view.window() else {
            let _ = done.send(Err("The window isn't open.".into()));
            return;
        };
        let Some(path) = path.to_str() else {
            let _ = done.send(Err("The file's path can't be printed to.".into()));
            return;
        };
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));

        // A copy, so the print window keeps the reader's own settings.
        let shared = NSPrintInfo::sharedPrintInfo();
        let info: Retained<NSPrintInfo> = unsafe { msg_send![&shared, copy] };
        info.setPaperSize(NSSize::new(points(sheet.width), points(sheet.height)));
        let [top, right, bottom, left] = sheet.margin;
        info.setTopMargin(points(top));
        info.setRightMargin(points(right));
        info.setBottomMargin(points(bottom));
        info.setLeftMargin(points(left));
        info.setHorizontalPagination(NSPrintingPaginationMode::Automatic);
        info.setVerticalPagination(NSPrintingPaginationMode::Automatic);
        info.setHorizontallyCentered(false);
        info.setVerticallyCentered(false);
        unsafe {
            info.setJobDisposition(NSPrintSaveJob);
            info.dictionary()
                .setObject_forKey(&url, ProtocolObject::from_ref(NSPrintJobSavingURL));
        }

        let operation = unsafe { view.printOperationWithPrintInfo(&info) };
        operation.setShowsPrintPanel(false);
        operation.setShowsProgressPanel(false);
        // WebKit lays the pages out for the operation's view: without a size it prints blank pages.
        if let Some(printed) = operation.view() {
            printed.setFrame(view.bounds());
        }

        let delegate = PrintDelegate::alloc(mtm).set_ivars(Ivars {
            done: RefCell::new(Some(done)),
        });
        let delegate: Retained<PrintDelegate> = unsafe { msg_send![super(delegate), init] };
        RUNNING.with(|running| *running.borrow_mut() = Some(delegate.clone()));
        unsafe {
            operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                &window,
                Some(&delegate),
                Some(sel!(printOperationDidRun:success:contextInfo:)),
                std::ptr::null_mut(),
            );
        }
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
fn print(_webview: tauri::webview::PlatformWebview, _path: &Path, _sheet: Sheet, done: Done) {
    let _ = done.send(Err("This system can't print to a file.".into()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_the_sheet() {
        let a4 = Sheet {
            width: 210.0,
            height: 297.0,
            margin: [18.0, 17.0, 18.0, 17.0],
        };
        assert!(a4.valid());
        assert!(!Sheet {
            width: f64::NAN,
            ..a4
        }
        .valid());
        assert!(!Sheet {
            width: 5000.0,
            ..a4
        }
        .valid());
        assert!(!Sheet {
            margin: [-1.0, 0.0, 0.0, 0.0],
            ..a4
        }
        .valid());
    }

    #[test]
    fn converts_millimetres() {
        assert!((points(25.4) - 72.0).abs() < 1e-9);
        assert!((inches(254.0) - 10.0).abs() < 1e-9);
    }
}
