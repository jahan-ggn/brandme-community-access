import db from "../db.server";
import { logger } from "../utils/logger.server";

export const loader = async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "healthy", database: "connected" },
      { status: 200 },
    );
  } catch (error) {
    logger.error({ err: error }, "Health check failed");
    return Response.json(
      { status: "unhealthy", database: "disconnected" },
      { status: 503 },
    );
  }
};
