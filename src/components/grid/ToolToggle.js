'use client';

import { playSound } from '@/lib/sound';

export default function ToolToggle({ tool, onToolChange }) {
  return (
    <div className="tool-toggle absolute bottom-4 right-4 z-20 flex gap-0.5 rounded-sm border-2 border-border-bright bg-surface p-[3px]">
      <button
        onClick={() => { playSound('tool-toggle'); onToolChange('pan'); }}
        title="Pan (drag to move)"
        className="btn-retro flex h-9 w-9 items-center justify-center p-0 text-[18px]"
        style={{ background: tool === 'pan' ? 'rgba(59,130,246,0.2)' : 'transparent', color: tool === 'pan' ? '#60a5fa' : '#94a3b8', borderColor: tool === 'pan' ? '#3b82f6' : 'transparent' }}
      >✋</button>
      <button
        onClick={() => { playSound('tool-toggle'); onToolChange('select'); }}
        title="Select (drag to multi-select, or hold Shift)"
        className="btn-retro flex h-9 w-9 items-center justify-center p-0 text-[18px]"
        style={{ background: tool === 'select' ? 'rgba(59,130,246,0.2)' : 'transparent', color: tool === 'select' ? '#60a5fa' : '#94a3b8', borderColor: tool === 'select' ? '#3b82f6' : 'transparent' }}
      >⬚</button>
    </div>
  );
}
