import type { Metadata } from "next";
import { WalletProvider } from "@/context/WalletContext";
import { I18nProvider } from "@/context/I18nContext";
import { WalletConnector } from "@/components/WalletConnector";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "SorobanLoyalty",
  description: "On-chain loyalty platform on Stellar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          <WalletProvider>
            <header className="site-header">
              <a href="/" className="logo">SorobanLoyalty</a>
              <nav>
                <a href="/dashboard">Dashboard</a>
                <a href="/merchant">Merchant</a>
                <a href="/analytics">Analytics</a>
              </nav>
              <LanguageSwitcher />
              <WalletConnector />
            </header>
            <main className="site-main">{children}</main>
          </WalletProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
