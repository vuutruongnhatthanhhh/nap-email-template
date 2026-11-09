import { supabase } from "./supabaseClient";

export type AiLength = "short" | "long";
export type AiTone = "formal" | "friendly" | "professional" | "persuasive";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

// Streams the generated email in as it arrives — onSubject fires once
// (as soon as the "SUBJECT: ...\n---\n" header is fully received), then
// onBodyChunk fires repeatedly with each new slice of HTML text so the
// caller can append it live instead of waiting for the whole response.
export async function composeWithAIStream(
  prompt: string,
  length: AiLength,
  tone: AiTone,
  callbacks: { onSubject: (subject: string) => void; onBodyChunk: (chunk: string) => void },
): Promise<void> {
  const res = await fetch("/api/ai/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ prompt, length, tone }),
  });

  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `Lỗi ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let headerBuffer = "";
  let subjectSent = false;

  while (true) {
    const { done, value } = await reader.read();
    const text = value ? decoder.decode(value, { stream: true }) : "";

    if (!subjectSent) {
      headerBuffer += text;
      const sepIdx = headerBuffer.indexOf("\n---\n");
      if (sepIdx !== -1) {
        const subject = headerBuffer.slice(0, sepIdx).replace(/^SUBJECT:\s*/i, "").trim();
        callbacks.onSubject(subject);
        subjectSent = true;
        const rest = headerBuffer.slice(sepIdx + 5);
        if (rest) callbacks.onBodyChunk(rest);
        headerBuffer = "";
      }
    } else if (text) {
      callbacks.onBodyChunk(text);
    }

    if (done) break;
  }
}
