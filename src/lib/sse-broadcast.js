/**
 * SSE broadcast module — singleton map of connected SSE clients.
 * Used by the /api/events route and any route that needs to push events.
 *
 * Known limitation: this is process-local state. It works for the current
 * single-process deployment, but would need Redis/pubsub or another shared bus
 * if the app is later scaled across multiple Node.js workers.
 */

const encoder = new TextEncoder();
const clients = new Map();
let nextId = 0;

/**
 * Register a new SSE client.
 * @param {ReadableStreamDefaultController<Uint8Array>} controller
 * @returns {number} client id (use to remove later)
 */
export function addSseClient(controller) {
  const id = nextId++;
  clients.set(id, controller);
  return id;
}

/**
 * Remove a registered SSE client.
 * @param {number} id
 */
export function removeSseClient(id) {
  clients.delete(id);
}

/**
 * Broadcast an event to all connected SSE clients.
 * @param {object} event — JSON-serializable event object
 */
export function broadcast(event) {
  const data = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  for (const [id, controller] of clients) {
    try {
      controller.enqueue(data);
    } catch {
      clients.delete(id);
    }
  }
}
