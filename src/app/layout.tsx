import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOESIS",
  description: "Document answers with local side threads and controlled LLM context."
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
