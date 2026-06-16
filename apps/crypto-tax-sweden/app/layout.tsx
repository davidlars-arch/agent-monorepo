import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Skattkarta Crypto",
  description: "Sweden-first cryptocurrency tax calculator prototype."
};

export const viewport: Viewport = {
  themeColor: "#f7f8fb"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
