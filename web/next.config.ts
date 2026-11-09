import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  // A stray package-lock.json one level up (D:\dev\package-lock.json, from
  // an unrelated sibling project) makes Next.js/Turbopack misdetect the
  // workspace root as D:\dev and scan every sibling project under it —
  // pin it explicitly to this repo's root instead.
  turbopack: {
    root: resolve(__dirname, ".."),
  },
};

export default nextConfig;
