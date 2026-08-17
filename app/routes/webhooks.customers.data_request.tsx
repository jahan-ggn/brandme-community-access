import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

type CustomerDataRequestPayload = {
  customer?: {
    id?: number | string;
    email?: string;
  };
  data_request?: {
    id?: number | string;
  };
  orders_requested?: Array<number | string>;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  logger.info({ topic, shop }, "Webhook received");

  const data = payload as CustomerDataRequestPayload;
  const email = data.customer?.email?.trim() ?? "";

  if (!email) {
    logger.warn(
      {
        topic,
        shop,
        customerId: data.customer?.id,
        dataRequestId: data.data_request?.id,
      },
      "Customer data request received without email",
    );

    return new Response(null, { status: 200 });
  }

  const deliveryLogs = await db.deliveryLog.findMany({
    where: {
      shop,
      customerEmail: email,
    },
    select: {
      orderId: true,
      productId: true,
      discourseCommunity: true,
      eventType: true,
      status: true,
      createdAt: true,
    },
  });

  logger.info(
    {
      topic,
      shop,
      email,
      customerId: data.customer?.id,
      dataRequestId: data.data_request?.id,
      records: deliveryLogs.length,
    },
    "Customer data request processed",
  );

  return new Response(null, { status: 200 });
};
