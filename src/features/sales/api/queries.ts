import { queryKeys } from "@/shared/api/query-keys";
import { getCatalogPackagesWithTags } from "./package-actions";
import { semanticSearchCatalog } from "./catalog-embeddings";

export const catalogQueries = {
  list: (wsId: string) => ({
    queryKey: queryKeys.catalog.list(wsId),
    queryFn: () => getCatalogPackagesWithTags(wsId),
  }),
  semanticSearch: (wsId: string, query: string, limit = 10) => ({
    queryKey: ["catalog", wsId, "semantic", query] as const,
    queryFn: () => semanticSearchCatalog(wsId, query, limit),
    enabled: query.trim().length >= 3,
  }),
};
