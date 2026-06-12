import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Base Stats",
  description:
    "Unofficial Base wallet activity checker with Base Score and shareable stats cards.",
  openGraph: {
    title: "Base Stats",
    description:
      "Check your Base wallet activity, Base Score, active days, contracts, and share a private stats card.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Base Stats",
    description:
      "Check your Base wallet activity, Base Score, active days, contracts, and share a private stats card.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
