"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { parseCsv } from "@/lib/csv";
import Modal from "@/components/Modal";
import type { Recipient, RecipientInput, Template } from "@shared/types";

const EMPTY: RecipientInput = { email: "", name: "", company: "", template_id: null, notes: "" };

export default function RecipientsPage() {
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Recipient | null | "new">(null);
  const [form, setForm] = useState<RecipientInput>(EMPTY);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [{ data: r, error: rErr }, { data: t, error: tErr }] = await Promise.all([
      supabase.from("recipients").select("*").order("email", { ascending: true }),
      supabase.from("templates").select("*").order("name", { ascending: true }),
    ]);
    if (rErr) setError(rErr.message);
    if (tErr) setError(tErr.message);
    setRecipients((r ?? []) as Recipient[]);
    setTemplates((t ?? []) as Template[]);
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm(EMPTY);
    setEditing("new");
  }

  function openEdit(r: Recipient) {
    setForm({
      email: r.email,
      name: r.name ?? "",
      company: r.company ?? "",
      template_id: r.template_id,
      notes: r.notes ?? "",
    });
    setEditing(r);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = { ...form, email: form.email.trim().toLowerCase() };

    if (editing === "new") {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("recipients")
        .insert({ ...payload, owner_id: userData.user!.id });
      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }
    } else if (editing) {
      const { error } = await supabase.from("recipients").update(payload).eq("id", editing.id);
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

  async function handleDelete(r: Recipient) {
    if (!confirm(`Xoá người nhận "${r.email}"?`)) return;
    const { error } = await supabase.from("recipients").delete().eq("id", r.id);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  async function handleAssignTemplate(r: Recipient, templateId: string) {
    const { error } = await supabase
      .from("recipients")
      .update({ template_id: templateId || null })
      .eq("id", r.id);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  async function handleCsvImport(file: File) {
    setImportSummary(null);
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) return;

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const emailIdx = header.indexOf("email");
    if (emailIdx === -1) {
      setImportSummary("File CSV cần có cột 'email'. Các cột hỗ trợ: email,name,company,template_name");
      return;
    }
    const nameIdx = header.indexOf("name");
    const companyIdx = header.indexOf("company");
    const templateIdx = header.indexOf("template_name");

    const { data: userData } = await supabase.auth.getUser();
    const ownerId = userData.user!.id;
    const templateByName = new Map(templates.map((t) => [t.name.trim().toLowerCase(), t.id]));

    let unmatchedTemplates = 0;
    const payload = rows
      .slice(1)
      .map((row) => {
        const email = row[emailIdx]?.trim().toLowerCase();
        if (!email) return null;
        const templateName = templateIdx >= 0 ? row[templateIdx]?.trim() : "";
        const templateId = templateName ? templateByName.get(templateName.toLowerCase()) ?? null : null;
        if (templateName && !templateId) unmatchedTemplates++;
        return {
          owner_id: ownerId,
          email,
          name: nameIdx >= 0 ? row[nameIdx]?.trim() || null : null,
          company: companyIdx >= 0 ? row[companyIdx]?.trim() || null : null,
          template_id: templateId,
        };
      })
      .filter((r): r is NonNullable<typeof r> => !!r);

    if (!payload.length) {
      setImportSummary("Không có dòng hợp lệ nào trong file.");
      return;
    }

    const { error } = await supabase
      .from("recipients")
      .upsert(payload, { onConflict: "owner_id,email" });

    if (error) {
      setImportSummary(`Import lỗi: ${error.message}`);
      return;
    }

    setImportSummary(
      `Đã import ${payload.length} người nhận.` +
        (unmatchedTemplates ? ` ${unmatchedTemplates} dòng có template_name không khớp — để trống.` : ""),
    );
    load();
  }

  const filtered = (recipients ?? []).filter((r) => {
    const hay = `${r.name ?? ""} ${r.email} ${r.company ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-lg font-semibold">Người nhận</h1>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg px-4 py-2"
          >
            Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCsvImport(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={openNew}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg px-4 py-2"
          >
            + Người nhận mới
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        CSV cần cột <code>email</code>, có thể thêm <code>name</code>, <code>company</code>,{" "}
        <code>template_name</code> (phải khớp tên template đã tạo).
      </p>
      {importSummary && (
        <div className="text-xs bg-blue-50 text-blue-800 border border-blue-100 rounded-lg px-3 py-2 mb-3">
          {importSummary}
        </div>
      )}
      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo tên, email, công ty…"
        className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600 mb-4"
      />

      {recipients === null ? (
        <div className="text-sm text-gray-500">Đang tải…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl p-8 text-center">
          Chưa có người nhận nào.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="px-4 py-2 font-medium">Người nhận</th>
                <th className="px-4 py-2 font-medium">Công ty</th>
                <th className="px-4 py-2 font-medium">Template</th>
                <th className="px-4 py-2 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.name || r.email}</div>
                    {r.name && <div className="text-xs text-gray-500">{r.email}</div>}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{r.company || "—"}</td>
                  <td className="px-4 py-2">
                    <select
                      value={r.template_id ?? ""}
                      onChange={(e) => handleAssignTemplate(r, e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs outline-none focus:border-blue-600"
                    >
                      <option value="">— chưa gán —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(r)} className="text-xs text-blue-600 hover:text-blue-800 mr-3">
                      Sửa
                    </button>
                    <button onClick={() => handleDelete(r)} className="text-xs text-red-500 hover:text-red-700">
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing === "new" ? "Người nhận mới" : "Sửa người nhận"} onClose={() => setEditing(null)}>
          <form onSubmit={handleSave} className="flex flex-col gap-3">
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Tên</label>
                <input
                  value={form.name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Công ty</label>
                <input
                  value={form.company ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Template</label>
              <select
                value={form.template_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value || null }))}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"
              >
                <option value="">— chưa gán —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Ghi chú</label>
              <textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-600"
              />
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
