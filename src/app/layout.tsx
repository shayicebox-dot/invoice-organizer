import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeScript } from '@/components/layout/theme-script';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ICEBOX OS',
    template: '%s · ICEBOX OS',
  },
  description: 'Internal financial operating system for ICEBOX.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
