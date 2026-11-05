import './globals.css';

export const metadata = {
  title: 'TrackDeck',
  description: 'AI Music Controller',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#07080b] text-zinc-100">{children}</body>
    </html>
  );
}