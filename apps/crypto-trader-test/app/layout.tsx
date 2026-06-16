import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Kraken Trader Dashboard",
  description: "Dry-run-first crypto trader dashboard with D3 P/L visualisation."
};

export const viewport: Viewport = {
  themeColor: "#08111f"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
