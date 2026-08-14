export const dashboardStyles = {
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "16px",
    marginTop: "16px",
  },

  statCard: {
    background: "#ffffff",
    border: "1px solid #e3e3e3",
    borderRadius: "12px",
    padding: "20px",
    minHeight: "120px",
    boxShadow: "0 1px 0 rgba(0, 0, 0, 0.05)",
  },

  statLabel: {
    fontSize: "13px",
    fontWeight: 600,
    lineHeight: "20px",
    color: "#616161",
  },

  statValue: {
    marginTop: "8px",
    fontSize: "28px",
    fontWeight: 650,
    lineHeight: "34px",
    letterSpacing: "-0.5px",
    color: "#303030",
  },

  statDescription: {
    marginTop: "6px",
    fontSize: "13px",
    lineHeight: "18px",
    color: "#8a8a8a",
  },

  chartCard: {
    marginTop: "24px",
    padding: "20px",
    background: "#ffffff",
    border: "1px solid #e3e3e3",
    borderRadius: "12px",
  },

  chartHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
  },

  chartTitle: {
    fontSize: "16px",
    fontWeight: 650,
    lineHeight: "24px",
    color: "#303030",
  },

  chartSubtitle: {
    marginTop: "2px",
    fontSize: "13px",
    lineHeight: "18px",
    color: "#8a8a8a",
  },

  chartLegend: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },

  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "#616161",
  },

  legendDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    display: "inline-block",
  },

  chart: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(52px, 1fr))",
    gap: "12px",
    marginTop: "28px",
    overflowX: "auto",
    paddingBottom: "4px",
  },

  chartColumn: {
    minWidth: "52px",
    textAlign: "center",
  },

  barArea: {
    height: "150px",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    borderBottom: "1px solid #e3e3e3",
  },

  barGroup: {
    height: "100%",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: "4px",
  },

  bar: {
    width: "8px",
    minHeight: "3px",
    borderRadius: "3px 3px 0 0",
    transition: "height 150ms ease",
  },

  chartLabel: {
    marginTop: "8px",
    fontSize: "11px",
    lineHeight: "16px",
    color: "#8a8a8a",
  },
} satisfies Record<string, React.CSSProperties>;
