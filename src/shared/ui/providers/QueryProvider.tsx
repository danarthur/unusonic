"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { getQueryClient } from "@/shared/api/query-client";

const ReactQueryDevtools = dynamic(
  () =>
    import("@tanstack/react-query-devtools").then((d) => ({
      default: d.ReactQueryDevtools,
    })),
  { ssr: false },
);

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
