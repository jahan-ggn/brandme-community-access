import * as Sentry from "@sentry/node";

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment = process.env.NODE_ENV ?? "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

export { Sentry };
