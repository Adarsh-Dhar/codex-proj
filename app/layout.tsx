import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Extension Sandbox",
  description: "Inspect and safely preview Chrome extension ZIP files.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
