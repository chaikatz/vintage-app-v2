import './globals.css'

export const metadata = {
  title: 'VINTAGE - A Museum for Your Memories',
  description: 'Share your favorite memories. No performances. Just real moments.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-vintage-cream min-h-screen">
        <div className="max-w-[430px] mx-auto bg-vintage-cream min-h-screen relative shadow-xl">
          {children}
        </div>
      </body>
    </html>
  )
}
