'use client';

export default function SelectionOverlay({ selectionRect, hintOnly = false }) {
  if (hintOnly) {
    return (
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md bg-accent-blue/90 px-3 py-1 text-[12px] text-white">
        Release to select tiles for batch claim
      </div>
    );
  }
  return (
    <div
      className="pointer-events-none absolute rounded-[2px] border-2 border-dashed border-accent-blue bg-transparent"
      style={{ left: selectionRect.x1, top: selectionRect.y1, width: selectionRect.x2 - selectionRect.x1, height: selectionRect.y2 - selectionRect.y1, borderColor: 'rgba(59,130,246,0.9)' }}
    />
  );
}
