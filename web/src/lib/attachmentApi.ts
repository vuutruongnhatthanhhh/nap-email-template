import { supabase } from "./supabaseClient";
import type { TemplateAttachment } from "@shared/types";

const BUCKET = "template-attachments";

// Supabase Storage rejects object keys containing accented characters (so
// Vietnamese filenames with dấu fail with "Invalid key") — strip diacritics
// and anything else unsafe for the *storage path only*. The original,
// accented name is kept as-is in `file_name` for display/download.
const COMBINING_MARKS = /[̀-ͯ]/g;

function sanitizeForStorageKey(name: string): string {
  // "đ"/"Đ" aren't decomposable via NFD (they're their own base letters, not
  // "d" + a diacritic mark), so they'd otherwise just vanish below.
  const withoutDStroke = name.replace(/đ/g, "d").replace(/Đ/g, "D");
  const stripped = withoutDStroke.normalize("NFD").replace(COMBINING_MARKS, "");
  const safe = stripped.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_");
  return safe.slice(0, 150) || "file";
}

export async function listAttachments(templateId: string): Promise<TemplateAttachment[]> {
  const { data, error } = await supabase
    .from("template_attachments")
    .select("*")
    .eq("template_id", templateId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TemplateAttachment[];
}

export async function uploadAttachment(templateId: string, file: File): Promise<TemplateAttachment> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("NOT_AUTHENTICATED");

  const path = `${user.id}/${templateId}/${crypto.randomUUID()}-${sanitizeForStorageKey(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("template_attachments")
    .insert({
      owner_id: user.id,
      template_id: templateId,
      file_name: file.name,
      storage_path: path,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TemplateAttachment;
}

export async function deleteAttachment(attachment: TemplateAttachment): Promise<void> {
  await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
  const { error } = await supabase.from("template_attachments").delete().eq("id", attachment.id);
  if (error) throw error;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
