import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-only: validates the caller's Supabase session and holds the
// Gemini API key — neither ever reaches the browser.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function requireUser(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

const LENGTH_OPTIONS = {
  short: "Ngắn gọn, súc tích, khoảng 80-120 từ.",
  long: "Đầy đủ, chi tiết, khoảng 220-300 từ.",
} as const;

const TONE_OPTIONS = {
  formal: "Trang trọng, lịch sự, đúng chuẩn mực giao tiếp công việc.",
  friendly: "Thân thiện, gần gũi, ấm áp nhưng vẫn chuyên nghiệp.",
  professional: "Chuyên nghiệp, rõ ràng, đi thẳng vào vấn đề, không rườm rà.",
  persuasive: "Thuyết phục, nhấn mạnh lợi ích cho người nhận, phù hợp văn phong bán hàng/marketing.",
} as const;

export type AiLength = keyof typeof LENGTH_OPTIONS;
export type AiTone = keyof typeof TONE_OPTIONS;

// Streamed as plain text (not JSON) so the client can start showing the
// body as it arrives: "SUBJECT: ...\n---\n<html body, streamed>". JSON mode
// (responseSchema) isn't usable here since partial JSON can't be rendered
// as it streams in.
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const prompt = String(body.prompt ?? "").trim();
  const length = (body.length as AiLength) in LENGTH_OPTIONS ? (body.length as AiLength) : "short";
  const tone = (body.tone as AiTone) in TONE_OPTIONS ? (body.tone as AiTone) : "professional";

  if (!prompt) {
    return NextResponse.json({ error: "Thiếu mô tả nội dung cần soạn" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Chưa cấu hình GEMINI_API_KEY ở server" }, { status: 500 });
  }

  // "flash-lite" is the lower-latency tier — confirmed via live testing to
  // respond noticeably faster than plain "flash" and support streaming,
  // despite ListModels' metadata not listing streamGenerateContent for it.
  // "flash" (gemini-3.8-flash) kept hitting 503 "high demand" and is slower
  // even when it does respond, likely due to its "thinking" step (visible
  // as a thoughtSignature field) that flash-lite mostly skips.
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

  const systemPrompt = `Bạn là trợ lý soạn email kinh doanh bằng tiếng Việt.

Yêu cầu nội dung từ người dùng: ${prompt}

Độ dài: ${LENGTH_OPTIONS[length]}
Văn phong: ${TONE_OPTIONS[tone]}

Nếu phù hợp với ngữ cảnh, có thể dùng các biến cá nhân hoá sau và GIỮ NGUYÊN dạng chữ của chúng (không dịch, không thay đổi): {{name}} (tên người nhận), {{company}} (tên công ty người nhận). Không bắt buộc phải dùng nếu không hợp ngữ cảnh.

Trả lời theo ĐÚNG định dạng dưới đây, không thêm bất kỳ chữ nào khác ngoài định dạng này (không markdown, không giải thích thêm):

SUBJECT: <tiêu đề email, ngắn gọn, không quá 80 ký tự>
---
<nội dung email dạng HTML đơn giản, chỉ dùng các thẻ <p>, <br>, <strong>, <em>, <u>, <ul>, <ol>, <li>. Không dùng markdown (không dùng **, #, -), không dùng thẻ <html>/<head>/<body>.>`;

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: systemPrompt }] }],
  });

  // Gemini returns 503 "model is currently experiencing high demand" fairly
  // often under load, and Google's own error message says it's "usually
  // temporary" — retry the *connection* a couple of times before giving up.
  // Once streaming has actually started there's no clean way to retry
  // (headers are already sent), so retries only apply to this first fetch.
  const MAX_ATTEMPTS = 3;
  let geminiRes: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody },
      );
    } catch {
      return NextResponse.json({ error: "Không gọi được Gemini (lỗi mạng)" }, { status: 502 });
    }

    if (geminiRes.ok) break;
    const errText = await geminiRes.text().catch(() => "");
    const retryable = geminiRes.status === 503 || geminiRes.status === 429;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: `Gemini lỗi ${geminiRes.status}: ${errText.slice(0, 300)}` },
        { status: 502 },
      );
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  if (!geminiRes || !geminiRes.body) {
    return NextResponse.json({ error: "Gemini không trả dữ liệu" }, { status: 502 });
  }

  const geminiReader = geminiRes.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sseBuffer = "";
      try {
        while (true) {
          const { done, value } = await geminiReader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? ""; // keep the last (possibly partial) line for next read
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
              const chunk = JSON.parse(jsonStr);
              const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) controller.enqueue(encoder.encode(text));
            } catch {
              // Partial/malformed SSE line — skip, next chunk will complete it.
            }
          }
        }
      } catch (e) {
        controller.error(e);
        return;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
