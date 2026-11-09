import { supabase } from "./supabaseClient";
import type { TemplateAttachment } from "@shared/types";

const BUCKET = "template-attachments";

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

  const path = `${user.id}/${templateId}/${crypto.randomUUID()}-${file.name}`;
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
