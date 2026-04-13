import { queryKeys } from "@/shared/api/query-keys";
import { getDashboardData } from "./get-dashboard-data";
import { getWorkspaceUsage } from "@/app/(dashboard)/settings/plan/actions";

export const dashboardQueries = {
  all: (wsId: string) => ({
    queryKey: queryKeys.dashboard.all(wsId),
    queryFn: () => getDashboardData(),
  }),
  usage: (wsId: string) => ({
    queryKey: [...queryKeys.dashboard.all(wsId), "usage"] as const,
    queryFn: () => getWorkspaceUsage(wsId),
    staleTime: 5 * 60_000,
  }),
};
