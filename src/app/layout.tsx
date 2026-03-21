import type { Metadata } from "next";
import Script from "next/script";

import "./globals.css";

export const metadata: Metadata = {
  title: "NewKanban · Collaborative Atrium",
  description:
    "Docker-ready collaborative workspace with Next.js, MongoDB, shadcn/ui, and realtime multi-device sync.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Script id="excalidraw-asset-path" strategy="beforeInteractive">
          {`window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";`}
        </Script>
        {children}
      </body>
    </html>
  );
}
