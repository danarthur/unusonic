import { queryKeys } from "@/shared/api/query-keys";
import { getNetworkNodeDetails } from "./network-read-actions";

export const networkQueries = {
  nodeDetail: (
    wsId: string,
    nodeId: string,
    kind: "internal_employee" | "extended_team" | "external_partner",
    sourceOrgId: string,
  ) => ({
    queryKey: [...queryKeys.entities.detail(wsId, nodeId), kind] as const,
    queryFn: () => getNetworkNodeDetails(nodeId, kind, sourceOrgId),
  }),
};
