"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/templates");
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const email = form.email.trim();
    const { password } = form;

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.replace("/templates");
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setSubmitting(false);
      if (error) {
        setError(error.message);
        return;
      }
      if (data.session) {
        // Email confirmation is disabled on this Supabase project, so
        // signUp already returns a live session — go straight in.
        router.replace("/templates");
        return;
      }
      setNotice("Tạo tài khoản thành công. Kiểm tra email để xác nhận, sau đó đăng nhập.");
      setMode("signin");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-lg font-semibold mb-1">
          {mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
        </h1>
        <p className="text-sm text-gray-500 mb-5">
          Quản lý template email &amp; danh sách người nhận.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"
            />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          {notice && <div className="text-sm text-green-700">{notice}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm rounded-lg py-2"
          >
            {submitting
              ? "Đang xử lý…"
              : mode === "signin"
                ? "Đăng nhập"
                : "Tạo tài khoản"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setError(null);
            setNotice(null);
          }}
          className="mt-4 text-xs text-gray-500 hover:text-gray-700 w-full text-center"
        >
          {mode === "signin"
            ? "Chưa có tài khoản? Tạo mới"
            : "Đã có tài khoản? Đăng nhập"}
        </button>
      </div>
    </div>
  );
}
