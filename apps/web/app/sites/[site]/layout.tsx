import { DM_Sans, Fraunces } from "next/font/google";

const body = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

export default function TenantSiteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${body.variable} ${display.variable}`}>{children}</div>;
}
