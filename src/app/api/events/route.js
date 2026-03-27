import { addSseClient, removeSseClient } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * GET /api/events — Server-Sent Events endpoint.
 * Clients connect here and receive real-time tile updates pushed by the server.
 *
 * Note: This is process-local state (single-instance deployment).
 * If scaled to multiple workers, a Redis pub/sub layer would be needed.
 */
export async function GET() {
  let clientId;
  let keepAliveTimer;

  const stream = new ReadableStream({
    start(controller) {
      clientId = addSseClient(controller);

      // Initial connected heartbeat
      controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

      // Keep-alive ping every 25s to prevent nginx proxy_read_timeout from closing the connection
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(`: keep-alive\n\n`);
        } catch {
          clearInterval(keepAliveTimer);
          removeSseClient(clientId);
        }
      }, KEEPALIVE_MS);
    },
    cancel() {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (clientId !== undefined) removeSseClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Disable nginx proxy buffering so SSE events flush immediately
      'X-Accel-Buffering': 'no',
    },
  });
}
