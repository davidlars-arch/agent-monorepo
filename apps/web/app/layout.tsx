import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Sphere",
  description: "OpenClaw project atlas with a 3D repo globe and runnable project surfaces."
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
