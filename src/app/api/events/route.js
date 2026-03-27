import { addSseClient, removeSseClient } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();
const KEEPALIVE_MS = 30000;

/**
 * GET /api/events — Server-Sent Events endpoint.
 * Clients connect here and receive real-time tile updates pushed by the server.
 *
 * Note: This uses an in-process client registry. That is fine for the current
 * single-instance deployment, but broadcasts will not cross process boundaries
 * if the app is later scaled to multiple Node.js workers.
 */
export async function GET() {
  let clientId;
  let keepAliveTimer;

  const stream = new ReadableStream({
    start(controller) {
      clientId = addSseClient(controller);

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
      );

      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          clearInterval(keepAliveTimer);
          removeSseClient(clientId);
        }
      }, KEEPALIVE_MS);
    },
    cancel() {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      removeSseClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
