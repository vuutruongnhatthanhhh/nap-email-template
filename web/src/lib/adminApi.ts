import { supabase } from "./supabaseClient";

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  is_admin: boolean;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export async function listUsers(): Promise<AdminUser[]> {
  const res = await fetch("/api/admin/users", { headers: await authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Không tải được danh sách tài khoản");
  return json.users as AdminUser[];
}

export async function createUser(email: string, password: string, isAdmin: boolean) {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ email, password, isAdmin }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Tạo tài khoản thất bại");
  return json as { ok: true; user: { id: string; email: string } };
}
