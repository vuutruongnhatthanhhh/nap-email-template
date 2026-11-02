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

export type TemplateInput = Pick<Template, "name" | "subject" | "body_html">;

export type RecipientInput = Pick<
  Recipient,
  "email" | "name" | "company" | "template_id" | "notes"
>;
