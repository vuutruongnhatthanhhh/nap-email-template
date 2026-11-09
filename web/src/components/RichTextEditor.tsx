"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Image from "@tiptap/extension-image";
import { uploadTemplateImage } from "@/lib/imageUpload";

const FONTS = [
  { label: "Mặc định", value: "" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
];

export default function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily,
      Image.configure({ HTMLAttributes: { style: "max-width:100%;border-radius:6px" } }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "min-h-[220px] max-h-[420px] overflow-y-auto border border-t-0 border-gray-300 rounded-b-lg px-3 py-2 text-sm outline-none focus:border-blue-600 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:my-1",
      },
    },
  });

  // useEditor only reads `content` at creation — without this, external
  // updates to `value` (e.g. AI-generated content replacing the draft)
  // never show up, since the editor otherwise only pushes changes outward
  // via onUpdate, never pulls them back in. Skip the no-op case (editor's
  // own onUpdate just set this same value) so the cursor doesn't jump.
  //
  // emitUpdate: false is required here — without it, this programmatic
  // setContent() re-fires onUpdate → onChange(editor.getHTML()), which
  // overwrites the caller's raw value with ProseMirror's reserialized HTML.
  // During AI streaming that stomps on the next chunk the caller appends
  // (it appends to its own last-sent value, not the reserialized one),
  // producing corrupted HTML like a stray "<p>" literal text mid-document —
  // exactly the bug reported when streaming AI-generated content in.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor || uploadingRef.current) return;
    uploadingRef.current = true;
    try {
      const url = await uploadTemplateImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      alert(`Tải ảnh lên thất bại: ${err instanceof Error ? err.message : "không rõ lỗi"}`);
    } finally {
      uploadingRef.current = false;
    }
  }

  if (!editor) return null;

  const btn = (active: boolean) =>
    `px-2 py-1 rounded text-xs font-semibold ${
      active ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border border-gray-300 rounded-t-lg px-2 py-1.5 bg-gray-50">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btn(editor.isActive("bold"))}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${btn(editor.isActive("italic"))} italic`}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`${btn(editor.isActive("underline"))} underline`}
        >
          U
        </button>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btn(editor.isActive("bulletList"))}
        >
          • Danh sách
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btn(editor.isActive("orderedList"))}
        >
          1. Danh sách
        </button>
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <select
          onChange={(e) => {
            const v = e.target.value;
            if (v) editor.chain().focus().setFontFamily(v).run();
            else editor.chain().focus().unsetFontFamily().run();
          }}
          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white"
          defaultValue=""
        >
          {FONTS.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          type="color"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          className="w-7 h-7 border border-gray-300 rounded cursor-pointer bg-white"
          title="Màu chữ"
        />
        <span className="w-px h-5 bg-gray-300 mx-1" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-2 py-1 rounded text-xs font-semibold text-gray-600 hover:bg-gray-100"
        >
          🖼 Chèn ảnh
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
