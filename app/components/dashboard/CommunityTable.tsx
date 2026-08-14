import type { CommunityStat } from "./types";

export function CommunityTable({
  communities,
}: {
  communities: CommunityStat[];
}) {
  if (communities.length === 0) {
    return <s-paragraph>No community delivery data available.</s-paragraph>;
  }

  const totals = communities.reduce(
    (acc, c) => ({
      purchasesDelivered: acc.purchasesDelivered + c.purchasesDelivered,
      refundsProcessed: acc.refundsProcessed + c.refundsProcessed,
      failedDeliveries: acc.failedDeliveries + c.failedDeliveries,
    }),
    { purchasesDelivered: 0, refundsProcessed: 0, failedDeliveries: 0 },
  );

  return (
    <s-table>
      <s-table-header-row>
        <s-table-header>Community</s-table-header>
        <s-table-header>Purchases Delivered</s-table-header>
        <s-table-header>Refunds Processed</s-table-header>
        <s-table-header>Failed Deliveries</s-table-header>
      </s-table-header-row>

      <s-table-body>
        {communities.map((community) => (
          <s-table-row key={community.community}>
            <s-table-cell>
              <strong>{community.community}</strong>
            </s-table-cell>

            <s-table-cell>
              {community.purchasesDelivered.toLocaleString()}
            </s-table-cell>

            <s-table-cell>
              {community.refundsProcessed.toLocaleString()}
            </s-table-cell>

            <s-table-cell>
              {community.failedDeliveries.toLocaleString()}
            </s-table-cell>
          </s-table-row>
        ))}

        <s-table-row>
          <s-table-cell>
            <strong>Total</strong>
          </s-table-cell>

          <s-table-cell>
            <strong>{totals.purchasesDelivered.toLocaleString()}</strong>
          </s-table-cell>

          <s-table-cell>
            <strong>{totals.refundsProcessed.toLocaleString()}</strong>
          </s-table-cell>

          <s-table-cell>
            <strong>{totals.failedDeliveries.toLocaleString()}</strong>
          </s-table-cell>
        </s-table-row>
      </s-table-body>
    </s-table>
  );
}
