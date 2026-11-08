import type { MetadataRoute } from "next";

/** Web app manifest: lets Android Chrome install the app to the home screen in standalone mode. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Macros & Calorie",
    short_name: "Macros",
    description: "Track calories, macros, micronutrients and supplements every day.",
    start_url: "/diary",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6f3",
    theme_color: "#0f7a4f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
