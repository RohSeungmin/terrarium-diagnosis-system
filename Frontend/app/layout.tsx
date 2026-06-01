import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner' 
import './globals.css'; // 혹은 스타일 파일 경로

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Lizard Temperature Control',
  description: 'Monitor and control terrarium temperature for your lizard enclosure',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-gray-100">
      <body className="font-sans antialiased bg-gray-100">
        {children}
        
        {/* 💡 화면 상단 중앙(top-center)에 이쁘게 뜨도록 설정를 추가했습니다 */}
        <Toaster position="top-center" richColors />
        
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}