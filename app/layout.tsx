import type { Metadata } from "next";
import "./globals.css";
import ScrollToTopButton from "@/components/ScrollToTopButton";

export const metadata: Metadata = {
  title: "Writer Studio Cloud | Channel OS",
  description: "Sistema Operacional de Conteúdo para múltiplos canais",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>
        {children}
        <ScrollToTopButton />
      </body>
    </html>
  );
}
