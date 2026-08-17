import type { HeadersFunction, LoaderFunctionArgs } from "react-router";

import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { Sentry } from "../utils/sentry";
import db from "../db.server";

import { StatsCards } from "../components/dashboard/StatsCards";
import { DeliveryChart } from "../components/dashboard/DeliveryChart";
import { CommunityTable } from "../components/dashboard/CommunityTable";
import { MAX_RETRY_ATTEMPTS } from "../utils/retry-config.server";
import type {
  DashboardData,
  ChartDataPoint,
  CommunityStat,
} from "../components/dashboard/types";

const CHART_DAYS = 30;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const now = new Date();

  const chartStartDate = new Date(now);
  chartStartDate.setUTCHours(0, 0, 0, 0);
  chartStartDate.setUTCDate(chartStartDate.getUTCDate() - (CHART_DAYS - 1));

  const [
    totalPurchasesDelivered,
    refundsProcessed,
    failedDeliveries,
    pendingRetries,
    recentLogs,
    groupedCommunityStats,
    uniqueCommunities,
    mappingCount,
  ] = await Promise.all([
    db.deliveryLog.count({
      where: { shop, eventType: "purchase", status: "delivered" },
    }),
    db.deliveryLog.count({
      where: { shop, eventType: "refund", status: "refund_delivered" },
    }),
    db.deliveryLog.count({
      where: { shop, status: { in: ["failed", "refund_failed"] } },
    }),
    db.retryQueue.count({
      where: { shop, attemptCount: { lt: MAX_RETRY_ATTEMPTS } },
    }),
    db.deliveryLog.findMany({
      where: {
        shop,
        createdAt: { gte: chartStartDate },
        OR: [
          { eventType: "purchase", status: "delivered" },
          { eventType: "refund", status: "refund_delivered" },
        ],
      },
      select: { eventType: true, createdAt: true },
    }),
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
    db.creatorMapping.findMany({
      where: { shop, enabled: true },
      select: { discourseUrl: true },
      distinct: ["discourseUrl"],
    }),
    db.creatorMapping.count({ where: { shop } }),
  ]);

  const dayMap = new Map<string, { purchases: number; refunds: number }>();

  for (let i = 0; i < CHART_DAYS; i++) {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - i);
    const dateKey = date.toISOString().slice(0, 10);
    dayMap.set(dateKey, { purchases: 0, refunds: 0 });
  }

  for (const log of recentLogs) {
    const dateKey = log.createdAt.toISOString().slice(0, 10);
    const entry = dayMap.get(dateKey);

    if (!entry) continue;

    if (log.eventType === "purchase") {
      entry.purchases++;
    } else if (log.eventType === "refund") {
      entry.refunds++;
    }
  }

  const chartData: ChartDataPoint[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date: new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      ...counts,
    }));

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

  const data: DashboardData = {
    stats: {
      totalPurchasesDelivered,
      refundsProcessed,
      failedDeliveries,
      pendingRetries,
      connectedCommunities: uniqueCommunities.length,
    },
    chartData,
    communityStats,
    hasMappings: mappingCount > 0,
  };

  return data;
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
      <s-section heading="Overview">
        <s-paragraph>
          A quick overview of community access activity across BrandMe.
        </s-paragraph>

        <StatsCards stats={data.stats} />

        <DeliveryChart data={data.chartData} />
      </s-section>

      <s-section heading="Community Breakdown">
        <s-paragraph>
          Access activity across connected creator communities.
        </s-paragraph>

        <CommunityTable communities={data.communityStats} />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  const error = useRouteError();
  Sentry.captureException(error);
  return boundary.error(error);
}
