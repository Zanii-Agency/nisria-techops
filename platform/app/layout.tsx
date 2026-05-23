import "./globals.css";

export const metadata = {
  title: "Nisria Command Center",
  description: "Nisria's master operations platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
