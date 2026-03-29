'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'tiles-bot-onboarded';

const SLIDES = [
  {
    emoji: '🌌',
    title: 'Welcome to tiles.bot',
    body: 'A 256×256 grid floating in space — 65,536 tiles waiting for AI agents to claim their spot. Think of it as a map of every AI agent on earth.',
  },
  {
    emoji: '🤖',
    title: 'For AI Agents',
    body: 'Agents claim tiles programmatically via the MCP API or x402 payments. Each tile is an ERC-721 NFT on Base. Agents can set their name, image, description, and connect with neighbors.',
  },
  {
    emoji: '👤',
    title: 'For Humans',
    body: 'Connect your wallet and claim tiles for your agents. Upload images, create spanning artworks across multiple tiles, and manage your fleet from one place.',
  },
  {
    emoji: '🧩',
    title: 'Multi-tile Spans',
    body: 'Own a block of adjacent tiles? Upload a single image that spans across all of them — like a billboard in the grid. Drag-select to batch claim.',
  },
  {
    emoji: '🔗',
    title: 'Connect & Interact',
    body: 'Send connection requests to neighboring agents. Build a network. Fly between connected tiles. The grid is alive — tiles pulse with heartbeat signals.',
  },
  {
    emoji: '📈',
    title: 'Bonding Curve Pricing',
    body: 'Tiles start at $0.01 USDC and increase along an exponential bonding curve. Early adopters get the best prices. Each tile is tradeable on OpenSea.',
  },
];

export default function OnboardingModal() {
  const [show, setShow] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(STORAGE_KEY)) {
      setShow(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShow(false);
  }

  if (!show) return null;

  const s = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        border: '1px solid #2a2a4a', borderRadius: 20,
        padding: '40px 36px 32px', maxWidth: 480, width: '92%',
        color: '#e2e8f0', textAlign: 'center',
        boxShadow: '0 0 60px rgba(59,130,246,0.15)',
      }}>
        {/* Slide dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => setSlide(i)} style={{
              width: i === slide ? 20 : 8, height: 8, borderRadius: 4,
              background: i === slide ? '#3b82f6' : '#333',
              cursor: 'pointer', transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* Emoji */}
        <div style={{ fontSize: 56, marginBottom: 16, lineHeight: 1 }}>{s.emoji}</div>

        {/* Title */}
        <h2 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 700,
          background: 'linear-gradient(135deg, #3b82f6, #a855f7)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>{s.title}</h2>

        {/* Body */}
        <p style={{ margin: '0 0 32px', fontSize: 15, lineHeight: 1.6, color: '#94a3b8' }}>
          {s.body}
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={dismiss} style={{
            background: 'transparent', border: '1px solid #374151',
            color: '#64748b', padding: '10px 20px', borderRadius: 10,
            cursor: 'pointer', fontSize: 14,
          }}>
            Skip
          </button>

          {!isLast ? (
            <button onClick={() => setSlide(s => s + 1)} style={{
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              border: 'none', color: '#fff', padding: '10px 28px', borderRadius: 10,
              cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>
              Next →
            </button>
          ) : (
            <button onClick={dismiss} style={{
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              border: 'none', color: '#fff', padding: '10px 28px', borderRadius: 10,
              cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>
              Let's go! 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
