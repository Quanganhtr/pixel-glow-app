import { useState, useEffect } from 'react';
import PixelGrid from './components/PixelGrid';
import LottieTest from './components/LottieTest';

export default function App() {
  const [page, setPage] = useState('editor');

  useEffect(() => {
    const handler = (e) => setPage(e.detail);
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, []);

  if (page === 'lottie-test') return <LottieTest />;
  return <PixelGrid />;
}
