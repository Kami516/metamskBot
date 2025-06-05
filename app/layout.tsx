// app/layout.tsx
export const metadata = {
    title: 'Telegram Phishing Monitor Bot',
    description: 'Monitor MetaMask phishing config for new threats',
  }
  
  export default function RootLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    )
  }