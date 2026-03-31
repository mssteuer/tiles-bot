'use client';

import { playSound } from '@/lib/sound';

export default function ToolToggle({ tool, onToolChange }) {
  const activeButtonClass = 'border-accent-blue bg-accent-blue/20 text-blue-300';
  const inactiveButtonClass = 'border-transparent bg-transparent text-text-gray';

  return (
    <div className="tool-toggle absolute bottom-4 right-4 z-20 flex gap-0.5 rounded-sm border-2 border-border-bright bg-surface p-[3px]">
      <button
        onClick={() => { playSound('tool-toggle'); onToolChange('pan'); }}
        title="Pan (drag to move)"
        className={`btn-retro flex h-9 w-9 items-center justify-center border text-[18px] ${tool === 'pan' ? activeButtonClass : inactiveButtonClass}`}
      >✋</button>
      <button
        onClick={() => { playSound('tool-toggle'); onToolChange('select'); }}
        title="Select (drag to multi-select, or hold Shift)"
        className={`btn-retro flex h-9 w-9 items-center justify-center border text-[18px] ${tool === 'select' ? activeButtonClass : inactiveButtonClass}`}
      >⬚</button>
    </div>
  );
}
