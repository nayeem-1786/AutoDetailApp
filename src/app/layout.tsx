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
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${urbanist.variable} ${dmSans.variable} antialiased`}
      >
        {children}
        <Toaster position="top-right" richColors closeButton expand visibleToasts={5} />
      </body>
    </html>
  );
}
