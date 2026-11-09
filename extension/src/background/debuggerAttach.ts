// Last-resort file-attach path: a synthetic DOM DragEvent (see
// content/selectors.ts attachFiles()) is untrusted and Gmail ignores it.
// chrome.debugger (Chrome DevTools Protocol) can dispatch a genuinely
// trusted drag event, but Input.dispatchDragEvent's file support takes
// real filesystem paths — not in-memory bytes — so each attachment has to
// be written to disk via chrome.downloads first, then cleaned up after.
//
// Attaching the debugger makes Chrome show a persistent "<extension> is
// debugging this browser" banner for as long as it's attached — kept this
// to the few seconds the drop takes, detached immediately after.
import { listTemplateAttachmentFiles } from "@/lib/api";

function waitForDownload(downloadId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const check = () => {
      chrome.downloads.search({ id: downloadId }, (results) => {
        const item = results[0];
        if (!item) {
          reject(new Error("DOWNLOAD_NOT_FOUND"));
          return;
        }
        if (item.state === "complete") {
          resolve(item.filename);
          return;
        }
        if (item.state === "interrupted") {
          reject(new Error(item.error ?? "DOWNLOAD_INTERRUPTED"));
          return;
        }
        setTimeout(check, 150);
      });
    };
    check();
  });
}

async function downloadToDisk(
  fileName: string,
  base64: string,
  contentType: string,
): Promise<{ id: number; path: string }> {
  const dataUrl = `data:${contentType};base64,${base64}`;
  const id = await new Promise<number>((resolve, reject) => {
    chrome.downloads.download(
      { url: dataUrl, filename: fileName, conflictAction: "uniquify", saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError || downloadId === undefined) {
          reject(new Error(chrome.runtime.lastError?.message ?? "DOWNLOAD_FAILED"));
        } else {
          resolve(downloadId);
        }
      },
    );
  });
  const path = await waitForDownload(id);
  return { id, path };
}

function debuggerAttach(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function debuggerDetach(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => resolve());
  });
}

function sendCommand(tabId: number, method: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

async function dispatchFileDrop(tabId: number, x: number, y: number, filePaths: string[]) {
  // dragOperationsMask is a required CDP field (bitmask of allowed ops —
  // 1 = Copy), not optional despite not being obviously needed for files.
  const data = { items: [], files: filePaths, dragOperationsMask: 1 };
  await sendCommand(tabId, "Input.dispatchDragEvent", { type: "dragEnter", x, y, data });
  await sendCommand(tabId, "Input.dispatchDragEvent", { type: "dragOver", x, y, data });
  await sendCommand(tabId, "Input.dispatchDragEvent", { type: "drop", x, y, data });
}

export async function attachFilesViaDebugger(
  tabId: number,
  templateId: string,
  x: number,
  y: number,
): Promise<{ ok: boolean; error?: string }> {
  console.log("[nap-email-template:bg] attachFilesViaDebugger start", { tabId, templateId, x, y });
  const files = await listTemplateAttachmentFiles(templateId);
  console.log("[nap-email-template:bg] files fetched:", files.length);
  if (!files.length) return { ok: true };

  const downloaded: { id: number; path: string }[] = [];
  try {
    for (const f of files) {
      console.log("[nap-email-template:bg] downloading to disk:", f.file_name);
      const d = await downloadToDisk(f.file_name, f.base64, f.content_type);
      console.log("[nap-email-template:bg] downloaded:", d);
      downloaded.push(d);
    }

    console.log("[nap-email-template:bg] attaching debugger to tab", tabId);
    await debuggerAttach(tabId);
    console.log("[nap-email-template:bg] debugger attached");
    try {
      await dispatchFileDrop(
        tabId,
        x,
        y,
        downloaded.map((d) => d.path),
      );
      console.log("[nap-email-template:bg] dispatchFileDrop done");
    } finally {
      await debuggerDetach(tabId);
      console.log("[nap-email-template:bg] debugger detached");
    }

    return { ok: true };
  } catch (e) {
    console.log("[nap-email-template:bg] attachFilesViaDebugger ERROR:", e);
    return { ok: false, error: e instanceof Error ? e.message : "ATTACH_FAILED" };
  } finally {
    // The drop event returning doesn't mean Gmail is done reading the file
    // off disk and uploading it — deleting right away raced that read and
    // produced "Attachment failed". Give it a size-scaled grace period
    // (assume a conservative ~200KB/s) before cleaning up, and don't make
    // the caller wait on this — the response already went out above.
    const totalBytes = files.reduce((sum, f) => sum + f.base64.length * 0.75, 0);
    const delayMs = Math.min(60000, 5000 + totalBytes / 200);
    console.log("[nap-email-template:bg] cleaning up temp file(s) in", Math.round(delayMs), "ms");
    setTimeout(() => {
      for (const d of downloaded) {
        chrome.downloads.removeFile(d.id, () => chrome.downloads.erase({ id: d.id }, () => {}));
      }
    }, delayMs);
  }
}
