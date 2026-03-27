import { addSseClient, removeSseClient, encodeSseMessage, encoder } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

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
  let keepAliveTimer;
  let clientId = null;

  const stream = new ReadableStream({
    start(controller) {
      clientId = addSseClient(controller);

      controller.enqueue(encoder.encode(': connected\n\n'));
      controller.enqueue(encodeSseMessage({ type: 'connected' }));

      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encodeSseMessage(null, { comment: 'keep-alive' }));
        } catch {
          clearInterval(keepAliveTimer);
          removeSseClient(clientId);
        }
      }, KEEPALIVE_MS);
    },
    cancel() {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (clientId !== null) removeSseClient(clientId);
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
