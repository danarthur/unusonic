import { queryKeys } from "@/shared/api/query-keys";
import { getDashboardData, type DashboardDataPeriod } from "./get-dashboard-data";
import { getWorkspaceUsage } from "@/app/(dashboard)/settings/plan/actions";

export const dashboardQueries = {
  all: (wsId: string, period?: DashboardDataPeriod) => ({
    queryKey: [
      ...queryKeys.dashboard.all(wsId),
      period?.periodStart ?? null,
      period?.periodEnd ?? null,
    ] as const,
    queryFn: () => getDashboardData(period),
  }),
  usage: (wsId: string) => ({
    queryKey: [...queryKeys.dashboard.all(wsId), "usage"] as const,
    queryFn: () => getWorkspaceUsage(wsId),
    staleTime: 5 * 60_000,
  }),
};
