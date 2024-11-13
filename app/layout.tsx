import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import "./globals.css";

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://jvm.expert'),
  applicationName: 'JVM Expert',

  keywords: 'JVM configuration tool, Java JVM optimization, Optimize JVM performance, Java memory management, Java heap configuration, JVM tuning guide, Java performance tuning, JVM memory calculator, Configure JVM settings, JVM optimization tips, Java application performance, JVM Expert tool, JVM best practices, Open source JVM tool, JVM parameters guide, Java garbage collection tuning, Java virtual machine performance, Java JVM recommendations, JVM optimization for production, Java startup performance, Optimize JVM heap size, Java tuning for large applications, Java application optimization, Java performance tips, Java memory allocation guide',
  verification: {
    google: "AzZT5Jz7T3cIN8WQK_b8nCmwDtCthcDOSE9SZD5hu48",
    yandex: "6f41a5cba5e05adb",
  },
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
