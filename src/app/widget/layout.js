/**
 * Widget layout — minimal, no shared header/footer.
 * Widgets are designed for iframe embedding.
 * X-Frame-Options header is handled by next.config.js (default: SAMEORIGIN is overridden for /widget/*).
 */
export default function WidgetLayout({ children }) {
  return children;
}
