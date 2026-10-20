import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/layout/providers";
import { localeDirection } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { fontVariables } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = getMessages(locale);
  return {
    title: { default: m.common.appName, template: `%s · ${m.common.appName}` },
    description: m.common.tagline,
    applicationName: m.common.appName,
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#F5F2EC",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = getMessages(locale);
  return (
    <html lang={locale} dir={localeDirection[locale]} className={`${fontVariables} h-full`} suppressHydrationWarning>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only z-[100] rounded-full bg-charcoal px-4 py-2 text-ivory focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          {messages.common.skipToContent}
        </a>
        <Providers locale={locale} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
