// Content script – runs on mail.google.com. Injects a floating icon next to
// each open compose window's Subject field; clicking it opens a panel to
// pick a recipient (single autofill) or a template + multiple recipients
// (batch autofill into Bcc, so recipients never see each other's address).
import type { Template, Recipient } from "@/lib/types";
import { fillPlaceholders } from "@shared/placeholders";
import {
  findComposeDialogs,
  getSubjectInput,
  fillRecipients,
  fillSubject,
  fillBody,
  clickSend,
  openNewComposeDialog,
  wait,
} from "./selectors";

const injected = new WeakSet<HTMLElement>();
const LOGO_URL = chrome.runtime.getURL("icons/icon48.png");

// "Gửi từng người" state: fill (never auto-send) one recipient per compose
// window, so {{name}}/{{company}} get substituted correctly per person. The
// user still has to click Gmail's real Send button themselves each time —
// opening the next compose window just advances to the next recipient.
interface SendQueue {
  items: { recipientId: string }[];
  index: number;
  template: Template;
  recipients: Recipient[];
}
let activeQueue: SendQueue | null = null;

async function fillForRecipient(dialog: HTMLElement, recipient: Recipient, template: Template) {
  const toOk = await fillRecipients(dialog, "To", [recipient.email]);
  const subjectOk = fillSubject(dialog, fillPlaceholders(template.subject, recipient));
  const bodyOk = fillBody(dialog, fillPlaceholders(template.body_html, recipient));
  return { toOk, subjectOk, bodyOk };
}

// Floating, independent progress card for the fully-automated send-all run
// — stays on screen across every compose window opening/closing so there's
// always a visible "still running" signal and a way to interrupt it.
function showProgressOverlay(total: number) {
  const host = document.createElement("div");
  Object.assign(host.style, { position: "fixed", bottom: "20px", right: "20px", zIndex: "2147483647" });
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
:host{display:block}
.card{width:260px;background:#fff;border:1px solid #dadce0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);font-family:Arial,sans-serif;padding:12px}
.title{font-size:12px;font-weight:700;color:#202124;margin-bottom:4px}
.bar-track{height:6px;border-radius:99px;background:#eee;overflow:hidden;margin:8px 0}
.bar-fill{height:100%;background:#1a73e8;width:0%;transition:width .2s}
.status{font-size:11px;color:#5f6368}
.stop{all:unset;display:block;margin-top:10px;text-align:center;font-size:12px;font-weight:600;color:#fff;background:#c5221f;border-radius:6px;padding:7px 0;cursor:pointer}
</style>
<div class="card">
  <div class="title">Đang tự động gửi…</div>
  <div class="bar-track"><div class="bar-fill"></div></div>
  <div class="status">0 / ${total}</div>
  <button class="stop">Dừng lại</button>
</div>`;

  let cancelled = false;
  root.querySelector(".stop")!.addEventListener("click", () => {
    cancelled = true;
    root.querySelector(".status")!.textContent = "Đang dừng…";
  });

  return {
    update(sent: number) {
      root.querySelector<HTMLElement>(".bar-fill")!.style.width = `${(sent / total) * 100}%`;
      root.querySelector(".status")!.textContent = `${sent} / ${total}`;
    },
    fail(message: string) {
      root.querySelector(".title")!.textContent = "Đã dừng — có lỗi";
      root.querySelector(".status")!.textContent = message;
      root.querySelector(".stop")!.remove();
      setTimeout(() => host.remove(), 6000);
    },
    done() {
      root.querySelector(".title")!.textContent = "Đã gửi xong";
      root.querySelector(".stop")!.remove();
      setTimeout(() => host.remove(), 4000);
    },
    stopped(sent: number) {
      root.querySelector(".title")!.textContent = "Đã dừng theo yêu cầu";
      root.querySelector(".status")!.textContent = `Đã gửi ${sent} / ${total}`;
      root.querySelector(".stop")!.remove();
      setTimeout(() => host.remove(), 5000);
    },
    isCancelled: () => cancelled,
    close: () => host.remove(),
  };
}

// The fully-automated "1 nút gửi hết" flow: opens a brand new compose
// window per recipient, fills it, clicks Send, waits a bit, repeats. Stops
// immediately (rather than skipping and continuing) the moment any step
// fails, since silently pressing on after an unexplained failure is how you
// end up sending broken or duplicate emails to people.
async function runAutoSendAll(recipients: Recipient[], template: Template) {
  const overlay = showProgressOverlay(recipients.length);

  for (let i = 0; i < recipients.length; i++) {
    if (overlay.isCancelled()) {
      overlay.stopped(i);
      return;
    }

    const recipient = recipients[i];
    const dialog = await openNewComposeDialog();
    if (!dialog) {
      overlay.fail(`Không mở được cửa sổ soạn thư mới (đã gửi ${i}/${recipients.length}).`);
      return;
    }

    const fillResult = await fillForRecipient(dialog, recipient, template);
    if (!fillResult.toOk || !fillResult.subjectOk || !fillResult.bodyOk) {
      overlay.fail(`Điền thiếu thông tin cho ${recipient.email} (đã gửi ${i}/${recipients.length}).`);
      return;
    }

    if (overlay.isCancelled()) {
      overlay.stopped(i);
      return;
    }

    const sent = await clickSend(dialog);
    if (!sent) {
      overlay.fail(`Không gửi được cho ${recipient.email} (đã gửi ${i}/${recipients.length}).`);
      return;
    }

    overlay.update(i + 1);
    await wait(2000);
  }

  overlay.done();
}

function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function safeSendMessage<T>(message: unknown): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
          return;
        }
        resolve(response as T | undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

function injectIcon(dialog: HTMLElement) {
  if (injected.has(dialog)) return;
  injected.add(dialog);

  const subjectInput = getSubjectInput(dialog);
  if (!subjectInput) return;

  // A "Gửi từng người" run is in progress — every freshly opened compose
  // window gets auto-filled with the next recipient in line. Nothing is
  // ever auto-sent; the user still clicks Gmail's own Send button.
  if (activeQueue && activeQueue.index < activeQueue.items.length) {
    const item = activeQueue.items[activeQueue.index];
    const recipient = activeQueue.recipients.find((r) => r.id === item.recipientId);
    if (recipient) fillForRecipient(dialog, recipient, activeQueue.template);
    activeQueue.index++;
    if (activeQueue.index >= activeQueue.items.length) activeQueue = null;
  }

  const iconHost = document.createElement("div");
  Object.assign(iconHost.style, {
    position: "fixed",
    zIndex: "2147483646",
    width: "26px",
    height: "26px",
    pointerEvents: "auto",
  });
  const iconRoot = iconHost.attachShadow({ mode: "open" });
  iconRoot.innerHTML = `
<style>
:host{display:block}
button{all:unset;width:26px;height:26px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #dadce0;box-shadow:0 1px 3px rgba(0,0,0,.15)}
button:hover{background:#f1f3f4}
img{width:16px;height:16px}
</style>
<button title="Điền template"><img src="${LOGO_URL}" alt="" /></button>`;

  const panelHost = document.createElement("div");
  Object.assign(panelHost.style, {
    position: "fixed",
    zIndex: "2147483647",
    display: "none",
  });
  document.body.appendChild(iconHost);
  document.body.appendChild(panelHost);

  function posIcon() {
    if (!document.contains(dialog) || !document.contains(subjectInput!)) {
      iconHost.remove();
      panelHost.remove();
      return;
    }
    const r = subjectInput!.getBoundingClientRect();
    iconHost.style.top = `${r.top + (r.height - 26) / 2}px`;
    iconHost.style.left = `${Math.max(4, r.right - 30)}px`;
  }
  window.addEventListener("scroll", posIcon, { passive: true, capture: true });
  window.addEventListener("resize", posIcon, { passive: true });
  posIcon();

  let panelOpen = false;
  function closePanel() {
    panelOpen = false;
    panelHost.style.display = "none";
  }
  function openPanel() {
    panelOpen = true;
    panelHost.style.display = "block";
    const r = subjectInput!.getBoundingClientRect();
    panelHost.style.top = `${r.bottom + 6}px`;
    panelHost.style.left = `${Math.max(4, r.right - 340)}px`;
    renderPanel(panelHost, dialog, closePanel);
  }

  iconRoot.querySelector("button")!.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    panelOpen ? closePanel() : openPanel();
  });

  document.addEventListener(
    "click",
    (e) => {
      if (!panelOpen) return;
      if (!e.composedPath().includes(iconHost) && !e.composedPath().includes(panelHost)) {
        closePanel();
      }
    },
    true,
  );
}

function renderPanel(host: HTMLElement, dialog: HTMLElement, close: () => void) {
  // "open" (not "closed") so reopening the panel can reuse host.shadowRoot
  // instead of re-attaching — closed roots always read back as null, even
  // from this same script, which caused "already hosts a shadow tree".
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
:host{display:block}
.panel{width:340px;max-height:420px;display:flex;flex-direction:column;background:#fff;border:1px solid #dadce0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);font-family:Arial,sans-serif;overflow:hidden}
.tabs{display:flex;border-bottom:1px solid #eee}
.tab{all:unset;flex:1;text-align:center;padding:9px 0;font-size:12px;font-weight:600;color:#5f6368;cursor:pointer;border-bottom:2px solid transparent;box-sizing:border-box}
.tab.active{color:#1a73e8;border-color:#1a73e8}
.body{flex:1;overflow-y:auto;padding:8px}
.search{width:100%;box-sizing:border-box;border:1px solid #dadce0;border-radius:6px;padding:6px 8px;font-size:12px;margin-bottom:8px;outline:none}
.search:focus{border-color:#1a73e8}
select{width:100%;box-sizing:border-box;border:1px solid #dadce0;border-radius:6px;padding:6px 8px;font-size:12px;margin-bottom:8px}
.item{display:flex;align-items:center;gap:8px;padding:7px 6px;border-radius:6px;cursor:pointer}
.item:hover{background:#f1f3f4}
.name{font-size:12px;font-weight:600;color:#202124}
.mail{font-size:11px;color:#5f6368}
.tpl{margin-left:auto;font-size:10px;color:#1a73e8;background:#e8f0fe;border-radius:99px;padding:2px 7px;white-space:nowrap}
.none{font-size:11px;color:#9aa0a6;padding:12px 4px;text-align:center}
.footer{border-top:1px solid #eee;padding:8px;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.btn{all:unset;background:#1a73e8;color:#fff;font-size:12px;font-weight:600;padding:7px 14px;border-radius:6px;cursor:pointer;white-space:nowrap}
.btn:disabled{background:#dadce0;cursor:default}
.btn-secondary{background:#fff;color:#1a73e8;border:1px solid #1a73e8}
.btn-secondary:disabled{background:#fff;color:#9aa0a6;border-color:#dadce0}
.btn-danger{background:#c5221f}
.btn-danger:disabled{background:#dadce0}
.check{width:14px;height:14px;flex-shrink:0}
.warn{font-size:10.5px;line-height:1.4;color:#8a6d00;background:#fff8e1;border:1px solid #ffe59a;border-radius:6px;padding:6px 8px;margin-bottom:8px}
.queue-banner{display:flex;align-items:center;gap:8px;font-size:11px;color:#0b57d0;background:#e8f0fe;border-bottom:1px solid #d2e3fc;padding:7px 10px}
.queue-banner span{flex:1}
.queue-cancel{all:unset;font-size:11px;font-weight:600;color:#b3261e;cursor:pointer;white-space:nowrap}
</style>
<div class="panel">
  <div class="tabs">
    <button class="tab active" data-tab="single">Điền nhanh</button>
    <button class="tab" data-tab="batch">Gửi hàng loạt (Bcc)</button>
  </div>
  <div class="body"><div class="none">Đang tải…</div></div>
</div>`;

  const panelEl = root.querySelector<HTMLElement>(".panel")!;
  if (activeQueue) {
    const remaining = activeQueue.items.length - activeQueue.index;
    const banner = document.createElement("div");
    banner.className = "queue-banner";
    banner.innerHTML = `<span>Đang gửi từng người — còn ${remaining} người</span><button class="queue-cancel">Huỷ</button>`;
    banner.querySelector(".queue-cancel")!.addEventListener("click", () => {
      activeQueue = null;
      banner.remove();
    });
    panelEl.insertBefore(banner, panelEl.querySelector(".tabs"));
  }

  const bodyEl = root.querySelector<HTMLElement>(".body")!;
  const tabBtns = root.querySelectorAll<HTMLButtonElement>(".tab");
  let activeTab: "single" | "batch" = "single";

  Promise.all([
    safeSendMessage<{ ok: boolean; templates?: Template[]; error?: string }>({
      type: "GET_TEMPLATES",
    }),
    safeSendMessage<{ ok: boolean; recipients?: Recipient[]; error?: string }>({
      type: "GET_RECIPIENTS",
    }),
  ]).then(([tplRes, recRes]) => {
    if (!tplRes?.ok || !recRes?.ok) {
      bodyEl.innerHTML = `<div class="none">Chưa đăng nhập. Mở popup extension để đăng nhập.</div>`;
      return;
    }
    const templates = tplRes.templates ?? [];
    const recipients = recRes.recipients ?? [];
    renderSingleTab(bodyEl, templates, recipients, dialog, close);

    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab as "single" | "batch";
        tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
        root.querySelector(".footer")?.remove();
        if (activeTab === "single") renderSingleTab(bodyEl, templates, recipients, dialog, close);
        else renderBatchTab(root, bodyEl, templates, recipients, dialog, close);
      });
    });
  });
}

function templateName(templates: Template[], id: string | null) {
  return templates.find((t) => t.id === id)?.name ?? null;
}

function renderSingleTab(
  bodyEl: HTMLElement,
  templates: Template[],
  recipients: Recipient[],
  dialog: HTMLElement,
  close: () => void,
) {
  bodyEl.innerHTML = `<input class="search" placeholder="Tìm người nhận…" /><div class="list"></div>`;
  const searchEl = bodyEl.querySelector<HTMLInputElement>(".search")!;
  const listEl = bodyEl.querySelector<HTMLElement>(".list")!;

  function draw(q: string) {
    const filtered = recipients.filter((r) => {
      const hay = `${r.name ?? ""} ${r.email} ${r.company ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
    if (!filtered.length) {
      listEl.innerHTML = `<div class="none">Không có người nhận nào. Thêm trong trang quản lý.</div>`;
      return;
    }
    listEl.innerHTML = filtered
      .map((r) => {
        const tpl = templateName(templates, r.template_id);
        return `<div class="item" data-id="${esc(r.id)}">
  <div>
    <div class="name">${esc(r.name || r.email)}</div>
    <div class="mail">${esc(r.email)}</div>
  </div>
  ${tpl ? `<div class="tpl">${esc(tpl)}</div>` : `<div class="tpl" style="color:#b06000;background:#fef7e0">chưa có mẫu</div>`}
</div>`;
      })
      .join("");

    listEl.querySelectorAll<HTMLElement>(".item").forEach((el) => {
      el.addEventListener("click", () => {
        const recipient = filtered.find((r) => r.id === el.dataset.id)!;
        const template = templates.find((t) => t.id === recipient.template_id) ?? null;
        if (template) fillForRecipient(dialog, recipient, template);
        else fillRecipients(dialog, "To", [recipient.email]);
        close();
      });
    });
  }

  draw("");
  searchEl.addEventListener("input", () => draw(searchEl.value.trim()));
}

function renderBatchTab(
  root: ShadowRoot,
  bodyEl: HTMLElement,
  templates: Template[],
  recipients: Recipient[],
  dialog: HTMLElement,
  close: () => void,
) {
  if (!templates.length) {
    bodyEl.innerHTML = `<div class="none">Chưa có template nào. Tạo trong trang quản lý.</div>`;
    return;
  }
  bodyEl.innerHTML = `
<select class="tpl-select">
  <option value="">— Chọn template —</option>
  ${templates.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}
</select>
<div class="list"></div>`;

  const select = bodyEl.querySelector<HTMLSelectElement>(".tpl-select")!;
  const listEl = bodyEl.querySelector<HTMLElement>(".list")!;
  let footer = root.querySelector<HTMLElement>(".footer");
  if (!footer) {
    footer = document.createElement("div");
    footer.className = "footer";
    root.querySelector(".panel")!.appendChild(footer);
  }
  footer.innerHTML = `
<button class="btn btn-secondary" disabled>Gửi từng người (0)</button>
<button class="btn btn-danger" disabled>Gửi hết tự động (0)</button>`;
  const sendIndividualBtn = footer.querySelectorAll<HTMLButtonElement>(".btn")[0];
  const autoSendAllBtn = footer.querySelectorAll<HTMLButtonElement>(".btn")[1];

  function resetButtons() {
    sendIndividualBtn.disabled = true;
    sendIndividualBtn.textContent = "Gửi từng người (0)";
    autoSendAllBtn.disabled = true;
    autoSendAllBtn.textContent = "Gửi hết tự động (0)";
  }

  function drawRecipients(templateId: string) {
    const scoped = recipients.filter((r) => r.template_id === templateId);
    if (!scoped.length) {
      listEl.innerHTML = `<div class="none">Không có người nhận nào dùng template này.</div>`;
      resetButtons();
      return;
    }
    listEl.innerHTML = scoped
      .map(
        (r) => `<label class="item" style="cursor:pointer">
  <input type="checkbox" class="check" data-id="${esc(r.id)}" checked />
  <div>
    <div class="name">${esc(r.name || r.email)}</div>
    <div class="mail">${esc(r.email)}</div>
  </div>
</label>`,
      )
      .join("");

    function updateCount() {
      const checked = listEl.querySelectorAll<HTMLInputElement>(".check:checked").length;
      sendIndividualBtn.disabled = checked === 0;
      sendIndividualBtn.textContent = `Gửi từng người (${checked})`;
      autoSendAllBtn.disabled = checked === 0;
      autoSendAllBtn.textContent = `Gửi hết tự động (${checked})`;
    }
    listEl.querySelectorAll<HTMLInputElement>(".check").forEach((cb) => {
      cb.addEventListener("change", updateCount);
    });
    updateCount();

    function getChosen() {
      const selectedIds = Array.from(
        listEl.querySelectorAll<HTMLInputElement>(".check:checked"),
      ).map((cb) => cb.dataset.id);
      return scoped.filter((r) => selectedIds.includes(r.id));
    }

    autoSendAllBtn.onclick = () => {
      const chosen = getChosen();
      if (!chosen.length) return;
      const template = templates.find((t) => t.id === templateId)!;
      if (
        !confirm(
          `Sẽ TỰ ĐỘNG mở và gửi ${chosen.length} email riêng biệt liên tục, không dừng lại hỏi han gì thêm (mỗi người {{name}}/{{company}} được thay đúng). Có nút Dừng lại trong lúc chạy. Tiếp tục?`,
        )
      )
        return;
      close();
      runAutoSendAll(chosen, template);
    };

    sendIndividualBtn.onclick = () => {
      const chosen = getChosen();
      if (!chosen.length) return;
      const template = templates.find((t) => t.id === templateId)!;
      // Fill this (already-open) compose window with the first recipient
      // right away; every compose window opened after this one picks up
      // the next recipient automatically (see injectIcon).
      fillForRecipient(dialog, chosen[0], template);
      activeQueue =
        chosen.length > 1
          ? { items: chosen.slice(1).map((r) => ({ recipientId: r.id })), index: 0, template, recipients }
          : null;
      close();
    };
  }

  select.addEventListener("change", () => {
    if (select.value) drawRecipients(select.value);
    else {
      listEl.innerHTML = "";
      resetButtons();
    }
  });
}

function scan() {
  findComposeDialogs().forEach(injectIcon);
}

scan();
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
