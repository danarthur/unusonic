import { queryKeys } from "@/shared/api/query-keys";
import { getCrmGigs } from "@/app/(dashboard)/(features)/crm/actions/get-crm-gigs";

export const crmQueries = {
  gigs: (wsId: string) => ({
    queryKey: queryKeys.deals.all(wsId),
    queryFn: () => getCrmGigs(),
    staleTime: 30_000,
  }),
};
