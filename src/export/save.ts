import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "@/lib/desktop-store";

/** A file an export made, ready to save. */
export interface ExportFile {
  /** Without the extension. */
  name: string;
  extension: string;
  bytes: Uint8Array;
}

export const TYPES: Record<string, string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html",
  zip: "application/zip",
  pdf: "application/pdf",
};

/**
 * Saves an export: in the desktop app where the reader picks in the
 * save dialog, in the browser as a download. Gives the saved file's
 * name, or null when the reader cancels.
 */
export async function saveExport(file: ExportFile): Promise<string | null> {
  if (isDesktop) {
    return invoke<string | null>("export_save", file.bytes, {
      headers: {
        "x-name": encodeURIComponent(file.name),
        "x-extension": file.extension,
      },
    });
  }
  const url = URL.createObjectURL(
    new Blob([file.bytes as BlobPart], { type: TYPES[file.extension] ?? "" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${file.name}.${file.extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return link.download;
}

/** Shows the file the desktop app saved last in the system's file manager. */
export const revealExport = () => invoke<void>("export_reveal");
