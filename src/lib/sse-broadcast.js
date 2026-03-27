/**
 * SSE broadcast module — singleton map of connected SSE clients.
 * Used by the /api/events route and any route that needs to push events.
 */

const clients = new Map();
let nextId = 0;

/**
 * Register a new SSE client.
 * @param {ReadableStreamDefaultController} controller
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
