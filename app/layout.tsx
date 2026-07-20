import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SHAZAN AI — Imagine it. Direct it. Bring it to life.",
  description:
    "A cinematic generative AI studio for image, video, music, voice, avatars and creative enhancement.",
  other: {
    "shazan-api-bridge": "workflow-studio-v1",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
