/**
 * Engine settings — Server Component route entry. The interactive surface
 * lives in page-client.tsx so the route's bundle boundary is Next-preferred
 * (server-safe entry, client boundary pushed inward).
 */
import EnginePageClient from './page-client';

export default function EnginePage() {
  return <EnginePageClient />;
}
