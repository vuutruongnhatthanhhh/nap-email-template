"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/Modal";
import RichTextEditor from "@/components/RichTextEditor";
import type { ReplySnippet, ReplySnippetInput } from "@shared/types";

const EMPTY: ReplySnippetInput = { name: "", content_html: "" };

export default function SnippetsPage() {
  const [snippets, setSnippets] = useState<ReplySnippet[] | null>(null);
  const [editing, setEditing] = useState<ReplySnippet | null | "new">(null);
  const [form, setForm] = useState<ReplySnippetInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("reply_snippets")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) setError(error.message);
    setSnippets((data ?? []) as ReplySnippet[]);
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm(EMPTY);
    setEditing("new");
  }

  function openEdit(s: ReplySnippet) {
    setForm({ name: s.name, content_html: s.content_html });
    setEditing(s);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (editing === "new") {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("reply_snippets")
        .insert({ ...form, owner_id: userData.user!.id });
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    } else if (editing) {
      const { error } = await supabase.from("reply_snippets").update(form).eq("id", editing.id);
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setEditing(null);
    load();
  }

  async function handleDelete(s: ReplySnippet) {
    if (!confirm(`Xoá mẫu phản hồi "${s.name}"?`)) return;
    const { error } = await supabase.from("reply_snippets").delete().eq("id", s.id);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Mẫu phản hồi</h1>
        <button
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg px-4 py-2"
        >
          + Mẫu mới
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Các câu trả lời hay dùng — chèn nhanh vào ô trả lời trong luồng thư trên Gmail.
      </p>

      {snippets === null ? (
        <div className="text-sm text-gray-500">Đang tải…</div>
      ) : snippets.length === 0 ? (
        <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl p-8 text-center">
          Chưa có mẫu phản hồi nào.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {snippets.map((s) => (
            <div key={s.id} className="border border-gray-200 bg-white rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-sm truncate">{s.name}</div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEdit(s)} className="text-xs text-blue-600 hover:text-blue-800">
                    Sửa
                  </button>
                  <button onClick={() => handleDelete(s)} className="text-xs text-red-500 hover:text-red-700">
                    Xoá
                  </button>
                </div>
              </div>
              <div
                className="text-xs text-gray-400 mt-2 line-clamp-3"
                dangerouslySetInnerHTML={{ __html: s.content_html }}
              />
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === "new" ? "Mẫu phản hồi mới" : "Sửa mẫu phản hồi"}
          onClose={() => setEditing(null)}
          widthClassName="max-w-2xl"
        >
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Tên mẫu</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: Xác nhận đã nhận được, Cảm ơn đã liên hệ…"
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Nội dung</label>
              <div className="mt-1">
                <RichTextEditor
                  value={form.content_html}
                  onChange={(html) => setForm((f) => ({ ...f, content_html: html }))}
                />
              </div>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button
              type="submit"
              disabled={saving}
              className="mt-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm rounded-lg py-2"
            >
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
