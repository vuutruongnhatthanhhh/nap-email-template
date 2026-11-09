"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/Modal";
import RichTextEditor from "@/components/RichTextEditor";
import TemplateAttachments from "@/components/TemplateAttachments";
import AIComposeBox from "@/components/AIComposeBox";
import type { Template, TemplateInput } from "@shared/types";

const EMPTY: TemplateInput = { name: "", subject: "", body_html: "" };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [editing, setEditing] = useState<Template | null | "new">(null);
  const [form, setForm] = useState<TemplateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) setError(error.message);
    setTemplates((data ?? []) as Template[]);
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm(EMPTY);
    setEditing("new");
  }

  function openEdit(t: Template) {
    setForm({ name: t.name, subject: t.subject, body_html: t.body_html });
    setEditing(t);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (editing === "new") {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("templates")
        .insert({ ...form, owner_id: userData.user!.id });
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    } else if (editing) {
      const { error } = await supabase.from("templates").update(form).eq("id", editing.id);
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

  async function handleDelete(t: Template) {
    if (!confirm(`Xoá template "${t.name}"?`)) return;
    const { error } = await supabase.from("templates").delete().eq("id", t.id);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Templates</h1>
        <button
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg px-4 py-2"
        >
          + Template mới
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Dùng {"{{name}}"}, {"{{email}}"}, {"{{company}}"} trong tiêu đề/nội dung để tự động điền
        theo từng người nhận.
      </p>

      {templates === null ? (
        <div className="text-sm text-gray-500">Đang tải…</div>
      ) : templates.length === 0 ? (
        <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl p-8 text-center">
          Chưa có template nào.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="border border-gray-200 bg-white rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{t.name}</div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">{t.subject || "(không có tiêu đề)"}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(t)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Xoá
                  </button>
                </div>
              </div>
              <div
                className="text-xs text-gray-400 mt-2 line-clamp-3"
                dangerouslySetInnerHTML={{ __html: t.body_html }}
              />
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === "new" ? "Template mới" : "Sửa template"}
          onClose={() => setEditing(null)}
          widthClassName="max-w-2xl"
        >
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Tên template</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"
              />
            </div>
            <AIComposeBox
              hasExistingContent={!!form.subject.trim() || !!form.body_html.trim()}
              onStart={() => setForm((f) => ({ ...f, subject: "", body_html: "" }))}
              onSubject={(subject) => setForm((f) => ({ ...f, subject }))}
              onBodyChunk={(chunk) => setForm((f) => ({ ...f, body_html: f.body_html + chunk }))}
            />
            <div>
              <label className="text-xs font-medium text-gray-600">Tiêu đề email</label>
              <input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="VD: Xin chào {{name}}"
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Nội dung</label>
              <div className="mt-1">
                <RichTextEditor
                  value={form.body_html}
                  onChange={(html) => setForm((f) => ({ ...f, body_html: html }))}
                />
              </div>
            </div>
            {editing === "new" ? (
              <p className="text-xs text-gray-400">Lưu template trước, rồi mở lại để đính kèm file.</p>
            ) : (
              editing && <TemplateAttachments templateId={editing.id} />
            )}
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
