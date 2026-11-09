"use client";

import { useState } from "react";
import { composeWithAIStream, type AiLength, type AiTone } from "@/lib/aiApi";

const LENGTH_LABELS: { value: AiLength; label: string }[] = [
  { value: "short", label: "Ngắn gọn (~100 từ)" },
  { value: "long", label: "Đầy đủ (~250 từ)" },
];

const TONE_LABELS: { value: AiTone; label: string }[] = [
  { value: "formal", label: "Trang trọng" },
  { value: "friendly", label: "Thân thiện" },
  { value: "professional", label: "Chuyên nghiệp" },
  { value: "persuasive", label: "Thuyết phục" },
];

export default function AIComposeBox({
  hasExistingContent,
  onStart,
  onSubject,
  onBodyChunk,
}: {
  hasExistingContent: boolean;
  onStart: () => void;
  onSubject: (subject: string) => void;
  onBodyChunk: (chunk: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [length, setLength] = useState<AiLength>("short");
  const [tone, setTone] = useState<AiTone>("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    if (hasExistingContent && !confirm("Tiêu đề và nội dung hiện tại sẽ bị thay thế. Tiếp tục?")) {
      return;
    }
    setLoading(true);
    setError(null);
    onStart();
    try {
      await composeWithAIStream(prompt.trim(), length, tone, { onSubject, onBodyChunk });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi không rõ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-purple-200 bg-purple-50 rounded-lg p-3">
      <div className="text-xs font-semibold text-purple-700 mb-2">✨ Soạn bằng AI</div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        placeholder="Mô tả nội dung email cần viết — VD: báo giá dịch vụ chăm sóc website hàng tháng cho khách hàng mới"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500 bg-white"
      />
      <div className="flex flex-wrap gap-2 mt-2">
        <select
          value={length}
          onChange={(e) => setLength(e.target.value as AiLength)}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
        >
          {LENGTH_LABELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value as AiTone)}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
        >
          {TONE_LABELS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="ml-auto bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg px-3 py-1.5"
        >
          {loading ? "Đang soạn…" : "Tạo nội dung"}
        </button>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
    </div>
  );
}
