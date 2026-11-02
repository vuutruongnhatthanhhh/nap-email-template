// Gmail's DOM is built on obfuscated, frequently-churning class names, so
// every hook into it lives in this one file — if Gmail changes its markup,
// this is the only place that needs patching. The selectors below favor
// attributes Gmail has kept stable for a long time (input[name="subjectbox"],
// aria-label on the message body and recipient fields) over class names.

export function findComposeDialogs(): HTMLElement[] {
  const subjectInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="subjectbox"]'),
  );
  const dialogs = subjectInputs
    .map(
      (input) =>
        input.closest<HTMLElement>('div[role="dialog"]') ??
        input.closest<HTMLElement>("table") ??
        input.parentElement,
    )
    .filter((el): el is HTMLElement => !!el);
  return Array.from(new Set(dialogs));
}

export function getSubjectInput(dialog: HTMLElement) {
  return dialog.querySelector<HTMLInputElement>('input[name="subjectbox"]');
}

export function getBodyEditable(dialog: HTMLElement) {
  return dialog.querySelector<HTMLElement>(
    'div[contenteditable="true"][aria-label="Message Body"], div[contenteditable="true"][g_editable="true"]',
  );
}

export type RecipientField = "To" | "Cc" | "Bcc";
type RecipientEl = HTMLInputElement | HTMLTextAreaElement;

// Confirmed via live Gmail DevTools inspection: the recipient combobox is an
// <input aria-label="To recipients" role="combobox" class="agP aFw"> — but
// Gmail's own casing isn't consistent ("To recipients" vs "BCC recipients",
// all-caps), so match case-insensitively (the trailing "i" flag) rather
// than guessing the exact casing per field.
export function getRecipientInput(dialog: HTMLElement, field: RecipientField): RecipientEl | null {
  return (
    dialog.querySelector<HTMLInputElement>(`input[aria-label="${field} recipients" i]`) ??
    dialog.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${field}" i]`) ??
    dialog.querySelector<HTMLInputElement>(`input[aria-label="${field}" i]`)
  );
}

// Cc/Bcc rows start hidden; clicking the toggle next to To reveals them.
// Confirmed via live Gmail DevTools inspection (right-click > Inspect on the
// real "Bcc" link): it's <span role="link" aria-label="Add Bcc recipients
// ‪(Ctrl-Shift-B)‬">. A *different* element with aria-label "Bcc - Select
// contacts" also exists nearby and opens Gmail's full contact-picker dialog
// instead — the "add … recipients" prefix is what tells them apart.
//
// A plain el.click() on the real toggle produces no effect at all (Gmail
// likely drives it off mousedown/mouseup or keyboard activation rather than
// a bare click), so fillRecipients() below tries several activation styles
// in turn and polls after each one.
function findRevealToggle(dialog: HTMLElement, field: "Cc" | "Bcc"): HTMLElement | null {
  const target = `add ${field.toLowerCase()} recipients`;
  return (
    Array.from(dialog.querySelectorAll<HTMLElement>('span[role="link"]')).find((el) =>
      (el.getAttribute("aria-label") ?? "").trim().toLowerCase().startsWith(target),
    ) ?? null
  );
}

function dispatchFullClick(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  };
  el.dispatchEvent(new PointerEvent("pointerdown", base));
  el.dispatchEvent(new MouseEvent("mousedown", base));
  el.dispatchEvent(new PointerEvent("pointerup", base));
  el.dispatchEvent(new MouseEvent("mouseup", base));
  el.dispatchEvent(new MouseEvent("click", base));
}

function dispatchEnterActivate(el: HTMLElement) {
  el.focus();
  for (const type of ["keydown", "keyup"]) {
    const event = new KeyboardEvent(type, { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(event, "keyCode", { get: () => 13 });
    el.dispatchEvent(event);
  }
}

// The toggle's own tooltip advertises this shortcut ("Add Bcc recipients
// (Ctrl-Shift-B)") — try it as a last resort.
function dispatchShortcut(dialog: HTMLElement, field: "Cc" | "Bcc") {
  const key = field === "Cc" ? "C" : "B";
  const target = getRecipientInput(dialog, "To") ?? dialog;
  for (const type of ["keydown", "keyup"]) {
    target.dispatchEvent(
      new KeyboardEvent(type, {
        key,
        code: `Key${key}`,
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitForRecipientInput(
  dialog: HTMLElement,
  field: RecipientField,
  // A freshly opened compose window (e.g. auto-filled from the "Gửi từng
  // người" queue, right as the dialog appears) can take noticeably longer
  // than 300ms for the recipient widget specifically to mount, even though
  // Subject/Body are already there — so default to a more generous window.
  tries = 16,
  delayMs = 75,
): Promise<RecipientEl | null> {
  let input = getRecipientInput(dialog, field);
  for (let i = 0; i < tries && !input; i++) {
    await wait(delayMs);
    input = getRecipientInput(dialog, field);
  }
  return input;
}

// Which of these actually fires Gmail's handler is inconsistent (plain
// click() alone does nothing), so try progressively more "real" activation
// styles until one produces the input.
async function revealRecipientField(dialog: HTMLElement, field: "Cc" | "Bcc"): Promise<RecipientEl | null> {
  let input = await waitForRecipientInput(dialog, field, 1);
  if (input) return input;

  const toggle = findRevealToggle(dialog, field);
  if (!toggle) return null;

  toggle.click();
  input = await waitForRecipientInput(dialog, field, 4);
  if (input) return input;

  dispatchFullClick(toggle);
  input = await waitForRecipientInput(dialog, field, 4);
  if (input) return input;

  dispatchEnterActivate(toggle);
  input = await waitForRecipientInput(dialog, field, 4);
  if (input) return input;

  dispatchShortcut(dialog, field);
  return waitForRecipientInput(dialog, field, 4);
}

export function setNativeInputValue(el: RecipientEl, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillJoinedEmails(input: RecipientEl, emails: string[]) {
  input.focus();
  // A synthetic comma keydown doesn't put an actual "," character into the
  // field, so Gmail never sees a delimiter to chip on. Instead write the
  // whole comma-joined list at once (trailing comma included) and fire
  // "input" — this is the same signal Gmail's own paste handler reacts to
  // when you paste "a@x.com, b@y.com" into the field, so it auto-splits.
  setNativeInputValue(input, emails.join(", ") + ", ");
}

export async function fillRecipients(dialog: HTMLElement, field: RecipientField, emails: string[]) {
  if (!emails.length) return false;
  const input = field === "To" ? await waitForRecipientInput(dialog, field) : await revealRecipientField(dialog, field);
  if (!input) return false;

  fillJoinedEmails(input, emails);

  // On a freshly auto-filled compose window (the "Gửi từng người" queue),
  // Gmail sometimes swaps the recipient <input> out for a brand new DOM
  // node (same peoplekit-id, different element) shortly after it first
  // mounts — our value lands on the node that's about to be discarded. If
  // that happened, refill on whatever node is live now.
  await wait(300);
  if (!input.isConnected || input.value.trim() === "") {
    const freshInput = getRecipientInput(dialog, field);
    if (freshInput && freshInput !== input) fillJoinedEmails(freshInput, emails);
  }

  return true;
}

export function fillSubject(dialog: HTMLElement, subject: string) {
  const input = getSubjectInput(dialog);
  if (!input) return false;
  setNativeInputValue(input, subject);
  return true;
}

export function fillBody(dialog: HTMLElement, bodyHtml: string) {
  const body = getBodyEditable(dialog);
  if (!body) return false;
  body.focus();
  body.innerHTML = bodyHtml;
  body.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return true;
}

// Confirmed via live Gmail DevTools inspection: <div role="button"
// aria-label="Send ‪(Ctrl-Enter)‬">. A sibling "More send options" button
// (the small dropdown arrow) also has role="button" but its aria-label
// starts with "More", not "Send", so the prefix check tells them apart.
export function getSendButton(dialog: HTMLElement): HTMLElement | null {
  return (
    Array.from(dialog.querySelectorAll<HTMLElement>('div[role="button"]')).find((el) =>
      (el.getAttribute("aria-label") ?? "").trim().toLowerCase().startsWith("send"),
    ) ?? null
  );
}

// Sending closes/removes the compose dialog, so "did it work" is checked by
// whether the Send button (and dialog) is still there after each attempt.
export async function clickSend(dialog: HTMLElement): Promise<boolean> {
  const btn = getSendButton(dialog);
  if (!btn) return false;

  const stillOpen = () => document.contains(dialog) && !!getSendButton(dialog);

  btn.click();
  await wait(400);
  if (!stillOpen()) return true;

  dispatchFullClick(btn);
  await wait(400);
  if (!stillOpen()) return true;

  dispatchEnterActivate(btn);
  await wait(400);
  return !stillOpen();
}

// Confirmed via live Gmail DevTools inspection: <div role="button" gh="cm">
// — "gh" (go-to handler) "cm" (compose mail) is one of Gmail's oldest,
// most stable hooks, predating aria-label-based attributes.
export function getComposeButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('div[gh="cm"]');
}

// Opens a brand new compose window and waits for it to be ready to fill
// (Subject input present). Used by the fully-automated "gửi hết, không
// dừng" flow to move from one recipient to the next without the user
// manually clicking Compose each time.
export async function openNewComposeDialog(): Promise<HTMLElement | null> {
  const before = new Set(findComposeDialogs());
  const btn = getComposeButton();
  if (!btn) return null;

  const pollForFresh = async () => {
    for (let i = 0; i < 20; i++) {
      await wait(150);
      const fresh = findComposeDialogs().find((d) => !before.has(d) && getSubjectInput(d));
      if (fresh) return fresh;
    }
    return null;
  };

  btn.click();
  let dialog = await pollForFresh();
  if (dialog) return dialog;

  dispatchFullClick(btn);
  dialog = await pollForFresh();
  if (dialog) return dialog;

  dispatchEnterActivate(btn);
  return pollForFresh();
}
