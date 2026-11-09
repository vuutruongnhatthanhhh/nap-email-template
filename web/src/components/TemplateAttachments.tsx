"use client";

import { useEffect, useRef, useState } from "react";
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  formatBytes,
} from "@/lib/attachmentApi";
import type { TemplateAttachment } from "@shared/types";

const GMAIL_LIMIT_BYTES = 25 * 1024 * 1024;

export default function TemplateAttachments({ templateId }: { templateId: string }) {
  const [attachments, setAttachments] = useState<TemplateAttachment[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      setAttachments(await listAttachments(templateId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải danh sách file");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  async function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > GMAIL_LIMIT_BYTES) {
      setError("File lớn hơn 25MB — Gmail không cho gửi kèm file quá giới hạn này.");
      return;
    }
    setUploading(true);
    try {
      await uploadAttachment(templateId, file);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tải file lên thất bại");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(a: TemplateAttachment) {
    if (!confirm(`Xoá file "${a.file_name}"?`)) return;
    try {
      await deleteAttachment(a);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Xoá thất bại");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">File đính kèm</label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-60"
        >
          {uploading ? "Đang tải lên…" : "+ Thêm file"}
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleSelect} />
      </div>

      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}

      <div className="mt-2 flex flex-col gap-1.5">
        {attachments === null ? (
          <div className="text-xs text-gray-400">Đang tải…</div>
        ) : attachments.length === 0 ? (
          <div className="text-xs text-gray-400">Chưa có file nào.</div>
        ) : (
          attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-700">{a.file_name}</div>
                <div className="text-gray-400">{formatBytes(a.size_bytes)}</div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(a)}
                className="text-red-500 hover:text-red-700 shrink-0 ml-2"
              >
                Xoá
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
