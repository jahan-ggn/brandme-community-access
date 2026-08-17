import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

type CustomerRedactPayload = {
  customer?: {
    id?: number | string;
    email?: string;
  };
  orders_to_redact?: Array<number | string>;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  logger.info({ topic, shop }, "Webhook received");

  const data = payload as CustomerRedactPayload;
  const email = data.customer?.email?.trim() ?? "";

  if (!email) {
    logger.warn(
      {
        topic,
        shop,
        customerId: data.customer?.id,
      },
      "Customer redaction request received without email",
    );

    return new Response(null, { status: 200 });
  }

  const [deliveryLogs, retryQueue] = await db.$transaction([
    db.deliveryLog.deleteMany({
      where: { shop, customerEmail: email },
    }),
    db.retryQueue.deleteMany({
      where: { shop, customerEmail: email },
    }),
  ]);

  logger.info(
    {
      topic,
      shop,
      email,
      customerId: data.customer?.id,
      deletedDeliveryLogs: deliveryLogs.count,
      deletedRetryEntries: retryQueue.count,
    },
    "Customer data redacted",
  );

  return new Response(null, { status: 200 });
};
