export type { Template, Recipient } from "@shared/types";

export type ExtMessage =
  | { type: "GET_TEMPLATES" }
  | { type: "GET_RECIPIENTS" }
  | { type: "GET_AUTH_STATUS" };

export interface AuthStatusResponse {
  ok: true;
  loggedIn: boolean;
  email?: string;
}

export interface ErrorResponse {
  ok: false;
  error: string;
}
