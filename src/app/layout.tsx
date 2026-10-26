import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ConfirmHost } from "@/components/ui/confirm";
import { MotionProvider } from "@/components/ui/motion";
import { ThemeSync } from "@/components/ui/theme-sync";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_BOOT } from "@/lib/theme-boot";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Lovewall: open-source testimonials", template: "%s · Lovewall" },
  description: "Collect testimonials with one link and show a wall of love on your site. Open source and free to self-host.",
  applicationName: "Lovewall",
  authors: [{ name: "Nikhil Dhaliya" }],
  openGraph: { type: "website", siteName: "Lovewall", url: appUrl },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Lovewall", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0c" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        {/* Allowed by its sha256 in the CSP, so no nonce is needed and static pages stay static. */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh">
        <ThemeSync />
        <MotionProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <ConfirmHost />
        </MotionProvider>
        <Toaster
          position="top-center"
          offset={{ top: "max(16px, env(safe-area-inset-top))" }}
          mobileOffset={{ top: "max(12px, env(safe-area-inset-top))" }}
          gap={8}
          toastOptions={{
            className: "!rounded-[12px] !border-line !bg-surface !text-ink !shadow-float !font-sans",
            classNames: { description: "!text-muted", actionButton: "!bg-accent !text-on-accent !rounded-lg", icon: "!text-ink" },
          }}
        />
      </body>
    </html>
  );
}
