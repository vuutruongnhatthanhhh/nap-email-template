import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nạp Email Template — Quản lý",
  description: "Quản lý template email và danh sách người nhận cho tiện ích Gmail.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
