'use client';

import { useState, useEffect } from 'react';

function MobileHints() {
  const [visible, setVisible] = useState(true);
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  useEffect(() => {
    if (!isMobile) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [isMobile]);

  if (!visible) return null;

  return (
    <div
      className="absolute bottom-[60px] left-1/2 z-30 flex max-w-[90vw] -translate-x-1/2 animate-[fadeIn_0.3s_ease] flex-col gap-1.5 rounded-[10px] border border-border-dim bg-surface-dark px-4 py-2.5 text-center text-[12px] text-text-gray backdrop-blur-[8px]"
      onClick={() => setVisible(false)}
    >
      <div>👆 <strong className="text-text">Tap</strong> a tile to view or claim</div>
      <div>✌️ <strong className="text-text">Two fingers</strong> to pan & pinch to zoom</div>
    </div>
  );
}

export default MobileHints;
