import type { Metadata } from "next";
import "./globals.css";

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
      </body>
    </html>
  );
}
