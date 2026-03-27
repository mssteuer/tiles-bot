import { addSseClient, removeSseClient } from '@/lib/sse-broadcast';

export const dynamic = 'force-dynamic';

/**
 * GET /api/events — Server-Sent Events endpoint.
 * Clients connect here and receive real-time tile updates pushed by the server.
 */
export async function GET() {
  let clientId;

  const stream = new ReadableStream({
    start(controller) {
      // Register this client
      clientId = addSseClient(controller);

      // Send initial connected heartbeat
      controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    },
    cancel() {
      // Client disconnected — clean up
      removeSseClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
