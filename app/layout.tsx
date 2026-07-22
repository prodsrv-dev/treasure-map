import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Карта сокровищ",
  description:
    "Персональные карты сокровищ для приключений дома, на даче и во дворе.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
