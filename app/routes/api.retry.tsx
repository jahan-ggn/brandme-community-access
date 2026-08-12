import type { ActionFunctionArgs } from "react-router";
import { processRetryQueue } from "../utils/retry-queue.server";
import { logger } from "../utils/logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.RETRY_WORKER_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await processRetryQueue();
    return new Response("OK", { status: 200 });
  } catch (error) {
    logger.error({ err: error }, "Retry worker endpoint failed");
    return new Response("Internal Server Error", { status: 500 });
  }
};
