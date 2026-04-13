import * as Sentry from "@sentry/nextjs";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",

  sendDefaultPii: false,
  enableLogs: true,

  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      maskAllInputs: true,
      blockAllMedia: false,
    }),
    Sentry.browserTracingIntegration(),
  ],

  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }
    return event;
  },

  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === "navigation" && breadcrumb.data) {
      for (const key of ["from", "to"] as const) {
        const val = breadcrumb.data[key];
        if (typeof val === "string") {
          try {
            const url = new URL(val, "https://placeholder.local");
            for (const param of ["token", "code"]) {
              if (url.searchParams.has(param)) {
                url.searchParams.set(param, "[Filtered]");
              }
            }
            breadcrumb.data[key] = url.pathname + url.search + url.hash;
          } catch {
            // not a valid URL, leave as-is
          }
        }
      }
    }
    return breadcrumb;
  },
});
