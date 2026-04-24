/**
 * Catalog item builder — Server Component route entry. Interactive surface
 * lives in page-client.tsx; this file keeps the route bundle boundary
 * Next-preferred (server-safe entry, client boundary pushed inward).
 */
import CatalogBuilderPageClient from './page-client';

export default function CatalogBuilderPage() {
  return <CatalogBuilderPageClient />;
}
