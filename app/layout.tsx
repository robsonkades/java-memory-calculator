import type { Metadata } from "next";
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import SiteNav from './components/SiteNav';
import SiteFooter from './components/SiteFooter';
import ServiceWorkerRegistrar from './components/ServiceWorkerRegistrar';
import "./globals.css";

// Runs before the body paints: an explicit theme choice must win over the OS
// preference without a flash. Keep in sync with the guards in globals.css.
const THEME_INIT = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;

const geistSans = Geist({ subsets: ['latin'] });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  metadataBase: new URL('https://jvm.expert'),
  alternates: {
    canonical: '/',
    types: {
      'application/rss+xml': '/feed.xml',
    },
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
    // suppressHydrationWarning: the THEME_INIT script stamps data-theme on
    // <html> before hydration by design; the server never renders it. The
    // suppression is attribute-only and scoped to this element.
    <html lang="en" suppressHydrationWarning className={`${geistSans.className} ${geistMono.variable}`}>
      <body className="antialiased tracking-tight min-h-screen flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <SiteNav />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
        <Analytics />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
