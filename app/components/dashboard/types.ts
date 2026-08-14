export type DashboardStats = {
  totalPurchasesDelivered: number;
  refundsProcessed: number;
  failedDeliveries: number;
  pendingRetries: number;
  connectedCommunities: number;
};

export type ChartDataPoint = {
  date: string;
  purchases: number;
  refunds: number;
};

export type CommunityStat = {
  community: string;
  purchasesDelivered: number;
  refundsProcessed: number;
  failedDeliveries: number;
};

export type DashboardData = {
  stats: DashboardStats;
  chartData: ChartDataPoint[];
  communityStats: CommunityStat[];
};
