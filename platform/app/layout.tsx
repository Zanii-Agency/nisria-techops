import "./globals.css";
import AppFrame from "../components/AppFrame";

export const metadata = {
  title: "Nisria Command Center",
  description: "Nisria's master operations platform",
  icons: { icon: "/favicon.png", apple: "/favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Set the money-hide class BEFORE first paint so the privacy blur never
            flashes the real numbers on navigation (fixes the MoneyToggle FOUC). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('nis.hideMoney')==='1'){document.documentElement.classList.add('hide-money')}}catch(e){}`,
          }}
        />
      </head>
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
