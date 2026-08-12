import db from "../db.server";
import { logger } from "./logger.server";

let isShuttingDown = false;

export function isGracefulShutdown(): boolean {
  return isShuttingDown;
}

export function registerShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, "Graceful shutdown initiated");

    try {
      await db.$disconnect();
      logger.info("Database connection closed");
    } catch (error) {
      logger.error({ err: error }, "Error closing database connection");
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
