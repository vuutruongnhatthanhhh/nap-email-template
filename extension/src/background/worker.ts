// Background service worker – holds the Supabase session and answers data
// requests from the Gmail content script and the popup.
import { supabase } from "@/lib/supabase";
import { listTemplates, listRecipients, listReplySnippets, listTemplateAttachmentFiles } from "@/lib/api";
import { attachFilesViaDebugger } from "./debuggerAttach";
import type { ExtMessage } from "@/lib/types";

chrome.runtime.onMessage.addListener((msg: ExtMessage, sender, sendResponse) => {
  if (msg.type === "GET_TEMPLATES") {
    listTemplates()
      .then((templates) => sendResponse({ ok: true, templates }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === "GET_RECIPIENTS") {
    listRecipients()
      .then((recipients) => sendResponse({ ok: true, recipients }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === "GET_REPLY_SNIPPETS") {
    listReplySnippets()
      .then((snippets) => sendResponse({ ok: true, snippets }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === "GET_TEMPLATE_ATTACHMENTS") {
    listTemplateAttachmentFiles(msg.templateId)
      .then((files) => sendResponse({ ok: true, files }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === "ATTACH_FILES_DEBUGGER") {
    console.log("[nap-email-template:bg] ATTACH_FILES_DEBUGGER received, sender.tab?.id:", sender.tab?.id);
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "NO_TAB_ID" });
      return true;
    }
    attachFilesViaDebugger(tabId, msg.templateId, msg.x, msg.y)
      .then((res) => {
        console.log("[nap-email-template:bg] attachFilesViaDebugger result:", res);
        sendResponse(res);
      })
      .catch((e) => {
        console.log("[nap-email-template:bg] attachFilesViaDebugger threw:", e);
        sendResponse({ ok: false, error: e.message });
      });
    return true;
  }

  if (msg.type === "GET_AUTH_STATUS") {
    supabase.auth.getSession().then(({ data }) => {
      sendResponse({
        ok: true,
        loggedIn: !!data.session,
        email: data.session?.user.email,
      });
    });
    return true;
  }
});
