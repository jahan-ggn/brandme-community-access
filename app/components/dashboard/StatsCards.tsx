import { dashboardStyles as styles } from "./styles";
import type { DashboardStats } from "./types";

const STAT_CONFIG = [
  {
    key: "totalPurchasesDelivered" as const,
    label: "Total Purchases Delivered",
    description: "Successful purchase deliveries to Discourse",
  },
  {
    key: "refundsProcessed" as const,
    label: "Refunds Processed",
    description: "Successful refund revocations",
  },
  {
    key: "failedDeliveries" as const,
    label: "Failed Deliveries",
    description: "Deliveries that failed and may be retrying",
  },
  {
    key: "pendingRetries" as const,
    label: "Pending Retries",
    description: "Items in the retry queue awaiting redelivery",
  },
  {
    key: "connectedCommunities" as const,
    label: "Connected Communities",
    description: "Creator communities connected",
  },
] as const;

export function StatsCards({ stats }: { stats: DashboardStats }) {
  return (
    <div style={styles.statsGrid}>
      {STAT_CONFIG.map((stat) => (
        <div key={stat.key} style={styles.statCard}>
          <div style={styles.statLabel}>{stat.label}</div>

          <div style={styles.statValue}>{stats[stat.key].toLocaleString()}</div>

          <div style={styles.statDescription}>{stat.description}</div>
        </div>
      ))}
    </div>
  );
}
