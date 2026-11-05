import './globals.css';

export const metadata = {
  title: 'TrackDeck v0.0',
  description: 'AI Command Engine Testbed',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}