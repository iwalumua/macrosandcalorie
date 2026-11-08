import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { TZ_COOKIE } from "@/server/context";
import { BottomNav } from "./_components/BottomNav";
import { TimezoneSync } from "./_components/TimezoneSync";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Macros & Calorie", template: "%s · Macros & Calorie" },
  description: "Track calories, macros, micronutrients and supplements every day.",
  applicationName: "Macros & Calorie",
  appleWebApp: { capable: true, title: "Macros", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch and gesture bar; the layout pads for the safe areas itself.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1411" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read straight from the cookie (no database) so error pages still render if the database is down.
  const zone = (await cookies()).get(TZ_COOKIE)?.value ?? "";
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <TimezoneSync current={zone} />
        <main
          className="mx-auto w-full max-w-lg px-4 pb-28"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
        >
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
