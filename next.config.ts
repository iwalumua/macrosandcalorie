import type { NextConfig } from "next";

/**
 * `next dev` blocks dev-only requests that come from any hostname other than
 * localhost and the one the server was started with (see Next's
 * `allowedDevOrigins` docs). Opening the dev server from a phone by the PC's
 * address (http://192.168.1.20:3000) is such a request, so private network
 * ranges are listed here. This only affects `next dev`, never a production build.
 *
 * Not verified end to end: the sandbox this was written in could not complete a
 * dev-mode page load by LAN address with or without this list, while the
 * production build (`npm run build && npm start`) worked fine that way. For
 * phone testing, prefer the production build; see README. Add other hostnames,
 * such as a tunnel, with DEV_ALLOWED_ORIGINS="my-tunnel.example.com".
 */
const PRIVATE_NETWORKS = [
  "192.168.*.*",
  "10.*.*.*",
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
];
const extraOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [...PRIVATE_NETWORKS, ...extraOrigins],
  async redirects() {
    // The diary is the home screen. A config redirect is a real HTTP 307 sent
    // before anything renders, unlike redirect() inside a streamed page.
    return [{ source: "/", destination: "/diary", permanent: false }];
  },
};

export default nextConfig;
