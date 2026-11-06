import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Macros & Calorie",
  description: "Track calories, macros, micronutrients and supplements every day.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
