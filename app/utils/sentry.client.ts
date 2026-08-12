import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;
const environment = import.meta.env.MODE;

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  });
}

export { Sentry };
