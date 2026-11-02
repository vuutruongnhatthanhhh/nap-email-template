// Background service worker – holds the Supabase session and answers data
// requests from the Gmail content script and the popup.
import { supabase } from "@/lib/supabase";
import { listTemplates, listRecipients } from "@/lib/api";
import type { ExtMessage } from "@/lib/types";

chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
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
