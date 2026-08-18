import type { HeadersFunction, LoaderFunctionArgs } from "react-router";

import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { Sentry } from "../utils/sentry";
import db from "../db.server";

import { CommunityTable } from "../components/dashboard/CommunityTable";
import type { CommunityStat } from "../components/dashboard/types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [groupedCommunityStats, mappingCount] = await Promise.all([
    db.deliveryLog.groupBy({
      by: ["discourseCommunity", "eventType", "status"],
      where: {
        shop,
        OR: [
          { eventType: "purchase", status: "delivered" },
          { eventType: "refund", status: "refund_delivered" },
          { eventType: "purchase", status: "failed" },
          { eventType: "refund", status: "refund_failed" },
        ],
      },
      _count: { _all: true },
    }),
    db.creatorMapping.count({ where: { shop } }),
  ]);

  const communityMap = new Map<
    string,
    {
      purchasesDelivered: number;
      refundsProcessed: number;
      failedDeliveries: number;
    }
  >();

  for (const group of groupedCommunityStats) {
    const community = group.discourseCommunity;
    const entry = communityMap.get(community) ?? {
      purchasesDelivered: 0,
      refundsProcessed: 0,
      failedDeliveries: 0,
    };

    if (group.eventType === "purchase" && group.status === "delivered") {
      entry.purchasesDelivered += group._count._all;
    } else if (
      group.eventType === "refund" &&
      group.status === "refund_delivered"
    ) {
      entry.refundsProcessed += group._count._all;
    } else if (
      (group.eventType === "purchase" && group.status === "failed") ||
      (group.eventType === "refund" && group.status === "refund_failed")
    ) {
      entry.failedDeliveries += group._count._all;
    }

    communityMap.set(community, entry);
  }

  const communityStats: CommunityStat[] = Array.from(communityMap.entries())
    .map(([community, stats]) => ({ community, ...stats }))
    .sort((a, b) => b.purchasesDelivered - a.purchasesDelivered);

  return {
    communityStats,
    hasMappings: mappingCount > 0,
  };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();

  if (!data.hasMappings) {
    return (
      <s-page heading="Welcome to BrandMe Community Access">
        <s-section heading="Get started">
          <s-paragraph>
            Connect your Shopify collections to creator Discourse communities.
            When a customer purchases a product from a mapped collection, they
            automatically get access to the corresponding community.
          </s-paragraph>
          <s-paragraph>
            Create your first mapping to start delivering community access
            through Discourse.
          </s-paragraph>
          <s-button href="/app/mappings">Create your first mapping</s-button>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="BrandMe Community Access">
      <s-section heading="Community Breakdown">
        <s-paragraph>
          Access activity across connected creator communities.
        </s-paragraph>

        <CommunityTable communities={data.communityStats} />
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  Sentry.captureException(error);
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
