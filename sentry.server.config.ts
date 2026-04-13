import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? "development",

  sendDefaultPii: false,
  enableLogs: true,
  tracesSampleRate: 0.2,
  includeLocalVariables: true,

  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }
    if (event.request?.url) {
      try {
        const url = new URL(event.request.url);
        for (const param of ["token", "code"]) {
          if (url.searchParams.has(param)) {
            url.searchParams.set(param, "[Filtered]");
          }
        }
        event.request.url = url.toString();
      } catch {
        // not a valid URL, leave as-is
      }
    }
    return event;
  },
});
