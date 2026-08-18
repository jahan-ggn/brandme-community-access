const REQUIRED_ENV_VARS = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SCOPES",
  "RETRY_WORKER_SECRET",
] as const;

const OPTIONAL_ENV_VARS = ["VITE_SENTRY_DSN", "SHOP_CUSTOM_DOMAIN"] as const;

function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Set them in your .env file or deployment environment.`,
    );
  }

  const empty = OPTIONAL_ENV_VARS.filter((key) => process.env[key] === "");

  if (empty.length > 0) {
    console.warn(
      `Optional environment variables are empty: ${empty.join(", ")}.`,
    );
  }
}

validateEnv();
