import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-only: uses the service_role key, which must never reach the
// browser. This file only runs inside Next.js route handlers.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function requireAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .single();

  return profile?.is_admin ? userData.user : null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = data.users.map((u) => u.id);
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, is_admin").in("id", ids);
  const adminIds = new Set((profiles ?? []).filter((p) => p.is_admin).map((p) => p.id));

  const users = data.users
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      is_admin: adminIds.has(u.id),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const isAdmin = Boolean(body.isAdmin);

  if (!email || password.length < 6) {
    return NextResponse.json({ error: "Email/mật khẩu không hợp lệ (mật khẩu tối thiểu 6 ký tự)" }, { status: 400 });
  }

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // never goes through the rate-limited confirmation email flow
  });
  if (error || !created.user) {
    return NextResponse.json({ error: error?.message ?? "Tạo tài khoản thất bại" }, { status: 400 });
  }

  if (isAdmin) {
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: created.user.id, is_admin: true });
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, user: { id: created.user.id, email: created.user.email } });
}
