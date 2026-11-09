import { supabase } from "./supabase";
import type { Template, Recipient, ReplySnippet } from "@shared/types";

export async function listTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Template[];
}

export async function listRecipients(): Promise<Recipient[]> {
  const { data, error } = await supabase
    .from("recipients")
    .select("*")
    .order("email", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Recipient[];
}

export async function listReplySnippets(): Promise<ReplySnippet[]> {
  const { data, error } = await supabase
    .from("reply_snippets")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReplySnippet[];
}

export interface AttachmentFile {
  file_name: string;
  content_type: string;
  // base64, not a raw ArrayBuffer — chrome.runtime.sendMessage silently
  // mangles ArrayBuffers in the response payload (they arrive as an empty
  // {} on the other side), so transport as text instead.
  base64: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Downloads the actual file bytes (not just metadata) for every attachment
// on a template — only called for the one template actually being sent,
// right before filling the compose window.
export async function listTemplateAttachmentFiles(templateId: string): Promise<AttachmentFile[]> {
  const { data: rows, error } = await supabase
    .from("template_attachments")
    .select("file_name, content_type, storage_path")
    .eq("template_id", templateId);
  if (error) throw new Error(error.message);
  if (!rows?.length) return [];

  return Promise.all(
    rows.map(async (row) => {
      const { data: blob, error: dlError } = await supabase.storage
        .from("template-attachments")
        .download(row.storage_path as string);
      if (dlError || !blob) throw new Error(dlError?.message ?? "DOWNLOAD_FAILED");
      return {
        file_name: row.file_name as string,
        content_type: row.content_type as string,
        base64: arrayBufferToBase64(await blob.arrayBuffer()),
      };
    }),
  );
}
