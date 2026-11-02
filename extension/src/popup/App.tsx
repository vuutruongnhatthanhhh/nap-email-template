import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const APP_URL = (import.meta.env.NEXT_PUBLIC_APP_URL as string) || "http://localhost:3000";

export default function App() {
  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = loading
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password,
    });
    setSubmitting(false);
    if (error) setError(error.message);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (email === undefined) {
    return <div className="p-4 text-sm text-gray-500">Đang tải…</div>;
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <img src="/icons/icon48.png" className="w-6 h-6" alt="" />
        <span className="font-semibold text-sm">Nạp Email Template</span>
      </div>

      {email ? (
        <>
          <div className="text-xs text-gray-500">Đã đăng nhập</div>
          <div className="text-sm font-medium break-all">{email}</div>
          <a
            href={APP_URL}
            target="_blank"
            rel="noreferrer"
            className="text-center text-sm font-semibold text-white bg-brand hover:bg-brand-hover rounded-lg py-2"
          >
            Mở trang quản lý
          </a>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 py-1"
          >
            Đăng xuất
          </button>
        </>
      ) : (
        <form onSubmit={handleLogin} className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-600">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <label className="text-xs font-medium text-gray-600">Mật khẩu</label>
          <input
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {error && <div className="text-xs text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-1 text-sm font-semibold text-white bg-brand hover:bg-brand-hover disabled:opacity-60 rounded-lg py-2"
          >
            {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
          <a
            href={`${APP_URL}/login`}
            target="_blank"
            rel="noreferrer"
            className="text-center text-xs text-gray-500 hover:text-gray-700"
          >
            Chưa có tài khoản? Tạo trên trang quản lý
          </a>
        </form>
      )}
    </div>
  );
}
