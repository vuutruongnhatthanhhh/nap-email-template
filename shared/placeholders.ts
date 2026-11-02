import type { Recipient } from "./types";

// Supported tokens in template subject/body: {{name}}, {{email}}, {{company}}
export function fillPlaceholders(
  text: string,
  recipient: Pick<Recipient, "name" | "email" | "company">,
): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, recipient.name ?? "")
    .replace(/\{\{\s*email\s*\}\}/gi, recipient.email ?? "")
    .replace(/\{\{\s*company\s*\}\}/gi, recipient.company ?? "");
}
