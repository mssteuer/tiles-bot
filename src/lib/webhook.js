/**
 * Best-effort webhook delivery.
 * Fires a POST to the given URL with the provided payload.
 * - 3 second timeout
 * - No retries (fire-and-forget)
 * - Errors are swallowed — delivery failure never disrupts the main request
 */
export async function fireWebhook(url, payload) {
  if (!url) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // Best-effort — never throw
  }
}
