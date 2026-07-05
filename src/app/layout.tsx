import type { Metadata } from "next";
import { Geist, Geist_Mono, Russo_One, Space_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Operator-console brand type (matches the Figma "Personal tasks dashboard"
// reference, DECISIONS 4A): Russo One for display/headings, Space Mono for body
// text + machine identifiers. Exposed as CSS variables consumed by globals.css.
const russoOne = Russo_One({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgentBoard",
  description: "The human-in-the-loop control plane for a fleet of AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${russoOne.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
