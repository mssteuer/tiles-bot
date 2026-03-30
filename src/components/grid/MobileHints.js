'use client';

import { useState, useEffect } from 'react';

function MobileHints() {
  const [visible, setVisible] = useState(true);
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  useEffect(() => {
    if (!isMobile) { setVisible(false); return; }
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, [isMobile]);
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(10,10,15,0.92)', border: '1px solid #1a1a2e', borderRadius: 10,
      padding: '10px 16px', zIndex: 30, backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#94a3b8',
      maxWidth: '90vw', textAlign: 'center', animation: 'fadeIn 0.3s ease',
    }}
    onClick={() => setVisible(false)}>
      <div>👆 <strong style={{ color: '#e2e8f0' }}>Tap</strong> a tile to view or claim</div>
      <div>✌️ <strong style={{ color: '#e2e8f0' }}>Two fingers</strong> to pan & pinch to zoom</div>
    </div>
  );
}
export default MobileHints;
