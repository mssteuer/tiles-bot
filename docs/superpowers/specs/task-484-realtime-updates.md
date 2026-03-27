# Task #484 — Real-Time Tile Updates via SSE

## Goal
When any tile is claimed, all browsers currently viewing tiles.bot should see it update without manual refresh.

## Implementation: Server-Sent Events (SSE)

SSE is simpler than WebSocket and works perfectly for one-directional server→client pushes.

### New API route: GET /api/events/route.js
```js
export const dynamic = 'force-dynamic';
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // Register this client
      const clientId = addSseClient(controller);
      // Send initial heartbeat
      controller.enqueue(`data: {"type":"connected"}\n\n`);
      // Cleanup on disconnect handled by ReadableStream cancel
      return () => removeSseClient(clientId);
    },
    cancel(clientId) {
      removeSseClient(clientId);
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

### src/lib/sse-broadcast.js (new file)
```js
const clients = new Map();
let nextId = 0;

export function addSseClient(controller) {
  const id = nextId++;
  clients.set(id, controller);
  return id;
}
export function removeSseClient(id) {
  clients.delete(id);
}
export function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const [id, controller] of clients) {
    try { controller.enqueue(data); }
    catch { clients.delete(id); }
  }
}
```

### In claim route — after successful claim:
```js
import { broadcast } from '@/lib/sse-broadcast';
broadcast({ type: 'tile_claimed', tileId, tile: updatedTile });
```

### Frontend — src/app/page.js
```js
useEffect(() => {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    if (event.type === 'tile_claimed') {
      setGridData(prev => ({ ...prev, [event.tileId]: event.tile }));
      setStats(prev => ({ ...prev, claimed: prev.claimed + 1 }));
    }
  };
  return () => es.close();
}, []);
```

## Acceptance Criteria
- [ ] `GET /api/events` returns `Content-Type: text/event-stream` with initial connected event
- [ ] Claiming a tile triggers broadcast to all connected SSE clients
- [ ] Browser 1 claims tile → Browser 2 sees grid update without refresh
- [ ] SSE connection auto-reconnects if server restarts (browser EventSource does this natively)
- [ ] `npm run build` passes
- [ ] Browser QA: open two tabs, claim in one, screenshot showing update in both
