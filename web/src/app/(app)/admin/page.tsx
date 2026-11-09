"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { listUsers, createUser, type AdminUser } from "@/lib/adminApi";

const EMPTY = { email: "", password: "", isAdmin: false };

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    try {
      setUsers(await listUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không rõ");
    }
  }

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", userData.user.id)
        .single();
      if (!profile?.is_admin) {
        router.replace("/templates");
        return;
      }
      setAllowed(true);
      loadUsers();
    })();
  }, [router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { user } = await createUser(form.email.trim().toLowerCase(), form.password, form.isAdmin);
      setNotice(
        `Đã tạo tài khoản ${user.email}. Gửi mật khẩu cho người đó qua kênh riêng (Zalo/Slack…) — không có email tự động nào được gửi.`,
      );
      setForm(EMPTY);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setSaving(false);
    }
  }

  if (allowed === null) {
    return <div className="text-sm text-gray-500">Đang tải…</div>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-lg font-semibold mb-4">Tài khoản</h1>
        {users === null ? (
          <div className="text-sm text-gray-500">Đang tải…</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Quyền</th>
                  <th className="px-4 py-2 font-medium">Tạo lúc</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2">
                      {u.is_admin ? (
                        <span className="text-xs font-medium text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
                          Admin
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">Thành viên</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {new Date(u.created_at).toLocaleDateString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 h-fit">
        <h2 className="font-semibold text-sm mb-3">Tạo tài khoản mới</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Mật khẩu</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, password: randomPassword() }))}
                className="text-xs font-medium text-gray-600 border border-gray-300 rounded-lg px-2 hover:bg-gray-50"
              >
                Random
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={form.isAdmin}
              onChange={(e) => setForm((f) => ({ ...f, isAdmin: e.target.checked }))}
            />
            Cấp quyền admin (được tạo tài khoản khác)
          </label>

          {error && <div className="text-xs text-red-600">{error}</div>}
          {notice && <div className="text-xs text-green-700">{notice}</div>}

          <button
            type="submit"
            disabled={saving}
            className="mt-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm rounded-lg py-2"
          >
            {saving ? "Đang tạo…" : "Tạo tài khoản"}
          </button>
        </form>
      </div>
    </div>
  );
}
