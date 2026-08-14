import { dashboardStyles as styles } from "./styles";
import type { ChartDataPoint } from "./types";

const MAX_BAR_HEIGHT = 150;

function getBarHeight(value: number, maxValue: number): number {
  if (value === 0) return 0;
  if (maxValue === 0) return 0;
  return Math.max(3, (value / maxValue) * MAX_BAR_HEIGHT);
}

export function DeliveryChart({ data }: { data: ChartDataPoint[] }) {
  const maxValue = Math.max(
    ...data.map((d) => Math.max(d.purchases, d.refunds)),
    1,
  );

  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <div>
          <div style={styles.chartTitle}>Delivery Activity</div>

          <div style={styles.chartSubtitle}>
            Purchases delivered and refunds processed over the last 30 days
          </div>
        </div>

        <div style={styles.chartLegend}>
          <div style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: "#303030" }} />
            Purchases
          </div>

          <div style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: "#d72c0d" }} />
            Refunds
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div style={{ marginTop: "16px" }}>
          <s-paragraph>No delivery activity in the last 30 days.</s-paragraph>
        </div>
      ) : (
        <div style={styles.chart}>
          {data.map((item) => (
            <div key={item.date} style={styles.chartColumn}>
              <div style={styles.barArea}>
                <div style={styles.barGroup}>
                  <div
                    title={`Purchases: ${item.purchases}`}
                    style={{
                      ...styles.bar,
                      height: `${getBarHeight(item.purchases, maxValue)}px`,
                      background: "#303030",
                    }}
                  />

                  <div
                    title={`Refunds: ${item.refunds}`}
                    style={{
                      ...styles.bar,
                      height: `${getBarHeight(item.refunds, maxValue)}px`,
                      background: "#d72c0d",
                    }}
                  />
                </div>
              </div>

              <div style={styles.chartLabel}>{item.date}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
