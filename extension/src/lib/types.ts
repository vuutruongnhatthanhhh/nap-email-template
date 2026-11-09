export type { Template, Recipient, ReplySnippet } from "@shared/types";

export type ExtMessage =
  | { type: "GET_TEMPLATES" }
  | { type: "GET_RECIPIENTS" }
  | { type: "GET_REPLY_SNIPPETS" }
  | { type: "GET_AUTH_STATUS" }
  | { type: "GET_TEMPLATE_ATTACHMENTS"; templateId: string }
  | { type: "ATTACH_FILES_DEBUGGER"; templateId: string; x: number; y: number };

export interface AuthStatusResponse {
  ok: true;
  loggedIn: boolean;
  email?: string;
}

export interface ErrorResponse {
  ok: false;
  error: string;
}
