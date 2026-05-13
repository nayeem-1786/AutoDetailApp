import type { Metadata } from "next";
import { Urbanist, DM_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { getBusinessInfo } from "@/lib/data/business";
import { SITE_URL } from "@/lib/utils/constants";
import "./globals.css";

const urbanist = Urbanist({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const businessInfo = await getBusinessInfo();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || SITE_URL),
    title: businessInfo.name,
    description: `${businessInfo.name} — management platform`,
    other: {
      'format-detection': 'telephone=no',
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${urbanist.variable} ${dmSans.variable} antialiased`}
      >
        {children}
        {/* `expand` keeps multiple toasts vertically stacked instead of
            collapsed-with-hover-expand. Phase Messaging-1+2 follow-up: partial
            send outcomes emit a success + a warning together, and the default
            collapsed layout overlapped them visually. */}
        <Toaster position="top-right" richColors closeButton expand visibleToasts={5} duration={2000} />
      </body>
    </html>
  );
}
