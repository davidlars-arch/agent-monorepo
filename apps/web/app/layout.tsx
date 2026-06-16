import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenClaw Atlas",
  description: "OpenClaw project atlas with a 3D repo globe and runnable project surfaces."
};

export const viewport: Viewport = {
  themeColor: "#02030a",
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
