/**
 * SSE broadcast module — singleton map of connected SSE clients.
 * Used by the /api/events route and any route that needs to push events.
 */

const clients = new Map();
let nextId = 0;
let keepAliveTimer = null;
const KEEPALIVE_MS = 25000; // 25s — safely under nginx proxy_read_timeout (60s default)

function ensureKeepAliveLoop() {
  if (keepAliveTimer) return;

  keepAliveTimer = setInterval(() => {
    for (const [id, controller] of clients) {
      try {
        controller.enqueue(':keepalive\n\n');
      } catch {
        clients.delete(id);
      }
    }

    if (clients.size === 0 && keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
  }, KEEPALIVE_MS);
}

/**
 * Register a new SSE client.
 * @param {ReadableStreamDefaultController} controller
 * @returns {number} client id (use to remove later)
 */
export function addSseClient(controller) {
  const id = nextId++;
  clients.set(id, controller);
  ensureKeepAliveLoop();
  return id;
}

/**
 * Remove a registered SSE client.
 * @param {number} id
 */
export function removeSseClient(id) {
  clients.delete(id);

  if (clients.size === 0 && keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

/**
 * Broadcast an event to all connected SSE clients.
 * @param {object} event — JSON-serializable event object
 */
export function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const [id, controller] of clients) {
    try {
      controller.enqueue(data);
    } catch {
      // Client disconnected — clean up
      clients.delete(id);
    }
  }
}
