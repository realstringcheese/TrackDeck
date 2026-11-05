'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { handleAuthCallback } from '@/lib/spotify';

export default function CallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Connecting your Spotify account...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
      handleAuthCallback(code).then((success) => {
        if (success) {
          router.replace('/');
        } else {
          setStatus('Authentication failed. Please return to the homepage and try again.');
        }
      });
    } else {
      setStatus('No authorization code found in URL.');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-zinc-200 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-sm font-medium tracking-wide text-zinc-400">{status}</p>
    </div>
  );
}