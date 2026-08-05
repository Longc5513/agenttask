import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentTask | Bonded mandates on-chain",
  description: "Bonded mandate lifecycle for autonomous agent work on GenLayer.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
