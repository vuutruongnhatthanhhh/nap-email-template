export interface Template {
  id: string;
  owner_id: string;
  name: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
}

export interface Recipient {
  id: string;
  owner_id: string;
  email: string;
  name: string | null;
  company: string | null;
  template_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateAttachment {
  id: string;
  owner_id: string;
  template_id: string;
  file_name: string;
  storage_path: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface ReplySnippet {
  id: string;
  owner_id: string;
  name: string;
  content_html: string;
  created_at: string;
  updated_at: string;
}

export type TemplateInput = Pick<Template, "name" | "subject" | "body_html">;

export type RecipientInput = Pick<
  Recipient,
  "email" | "name" | "company" | "template_id" | "notes"
>;

export type ReplySnippetInput = Pick<ReplySnippet, "name" | "content_html">;
