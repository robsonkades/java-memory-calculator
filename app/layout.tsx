import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import "./globals.css";

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://jvm.expert'),
  alternates: {
    canonical: '/',
  },
  title: {
    default: 'JVM Expert',
    template: '%s | JVM Expert',
  },
  description: 'JVM Expert offers in-depth insights, guides, and solutions for optimizing Java Virtual Machine (JVM) performance. Discover best practices, tuning techniques, and expert advice to enhance your application\'s efficiency and scalability on the JVM.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.className}`}>
      <body className="antialiased tracking-tight">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
