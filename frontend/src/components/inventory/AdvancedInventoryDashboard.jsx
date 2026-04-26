import React, { useState, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBox,
  faExclamationTriangle,
  faChartLine,
  faWarehouse,
  faArrowUp,
  faArrowDown,
  faSync,
  faDownload,
  faPlus,
  faBell,
} from "@fortawesome/free-solid-svg-icons";
import { inventoryApi } from "../../api/inventory";
import { formatCurrency } from "../../utils/currency";
import { Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import "./AdvancedInventoryDashboard.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Stable trend values — moved outside component so they don't re-roll on re-render
const STABLE_TRENDS = [
  { value: "18.4%", icon: faArrowUp },
  { value: "11.2%", icon: faArrowUp },
  { value: "7.8%",  icon: faArrowUp },
];

const demoData = {
  total_items: 48,
  low_stock_items: 5,
  out_of_stock_items: 2,
  total_stock_value: 45280.5,
  inventory_turnover: 3.8,
  avg_days_in_stock: 12,
  top_moving_products: [
    { name: "Premium Dog Food 5kg", sold: 45, revenue: 54000.0 },
    { name: "Cat Kibble 2kg",        sold: 38, revenue: 32300.0 },
    { name: "Pet Grooming Service",  sold: 52, revenue: 33800.0 },
  ],
  stock_trend: {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    in_stock:      [42, 40, 45, 43, 46, 48, 48],
    low_stock:     [5,  8,  6,  7,  5,  5,  5],
    out_of_stock:  [2,  2,  1,  2,  1,  2,  2],
  },
  category_distribution: {
    labels: ["Food", "Accessories", "Grooming", "Toys", "Health", "Services"],
    values: [18, 12, 8, 5, 3, 2],
  },
  recent_movements: [
    { id: 1, type: "in",     item: "Premium Dog Food 5kg", quantity: 24,  date: "2024-04-21 09:30", user: "Admin"   },
    { id: 2, type: "out",    item: "Cat Kibble 2kg",        quantity: 5,   date: "2024-04-21 10:15", user: "Cashier" },
    { id: 3, type: "adjust", item: "Leather Dog Collar",    quantity: -2,  date: "2024-04-21 11:00", user: "Manager" },
    { id: 4, type: "in",     item: "Pet Shampoo 500ml",     quantity: 30,  date: "2024-04-21 14:20", user: "Admin"   },
  ],
};

const MOVEMENT_ICON = { in: faArrowUp, out: faArrowDown, adjust: faSync };
const MOVEMENT_LABEL = {
  in:     (q) => `Stock in: +${q}`,
  out:    (q) => `Stock out: -${q}`,
  adjust: (q) => `Adjustment: ${q > 0 ? "+" : ""}${q}`,
};

const AdvancedInventoryDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [usingDemoData, setUsingDemoData] = useState(false);
  const [timeRange, setTimeRange]         = useState("7d");
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const response = await inventoryApi.getDashboard({ period: timeRange });
        if (response) {
          setDashboardData(response);
          setUsingDemoData(false);
        } else {
          setDashboardData(demoData);
          setUsingDemoData(true);
        }
      } catch (err) {
        console.error("Dashboard API fetch failed, using demo fallback:", err);
        setDashboardData(demoData);
        setUsingDemoData(true);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [timeRange]);

  // ── Chart data ─────────────────────────────────────────────────────────────

  const stockTrendData = useMemo(() => ({
    labels: dashboardData?.stock_trend?.labels || [],
    datasets: [
      {
        label: "In Stock",
        data: dashboardData?.stock_trend?.in_stock || [],
        borderColor: "#10b981",
        backgroundColor: "rgba(16, 185, 129, 0.08)",
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointBackgroundColor: "#10b981",
        pointRadius: 4,
      },
      {
        label: "Low Stock",
        data: dashboardData?.stock_trend?.low_stock || [],
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.08)",
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointBackgroundColor: "#f59e0b",
        pointRadius: 4,
      },
      {
        label: "Out of Stock",
        data: dashboardData?.stock_trend?.out_of_stock || [],
        borderColor: "#ff5f93",
        backgroundColor: "rgba(255, 95, 147, 0.08)",
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointBackgroundColor: "#ff5f93",
        pointRadius: 4,
      },
    ],
  }), [dashboardData]);

  const categoryData = useMemo(() => ({
    labels: dashboardData?.category_distribution?.labels || [],
    datasets: [
      {
        data: dashboardData?.category_distribution?.values || [],
        // Pink-palette colours instead of generic blue/purple mix
        backgroundColor: [
          "#ff5f93",
          "#ff8db5",
          "#ffc8dd",
          "#10b981",
          "#f59e0b",
          "#94a3b8",
        ],
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  }), [dashboardData]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { usePointStyle: true, padding: 20, font: { family: "Jost, sans-serif", size: 12 } },
      },
      tooltip: {
        backgroundColor: "rgba(255,255,255,0.95)",
        titleColor: "#191919",
        bodyColor: "#64748b",
        borderColor: "rgba(255,95,147,0.22)",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "rgba(255, 95, 147, 0.06)" },
        ticks: { font: { family: "Jost, sans-serif", size: 11 }, color: "#94a3b8" },
      },
      x: {
        grid: { display: false },
        ticks: { font: { family: "Jost, sans-serif", size: 11 }, color: "#94a3b8" },
      },
    },
  }), []);

  const doughnutOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: "68%",
    plugins: {
      legend: {
        position: "right",
        labels: { usePointStyle: true, padding: 14, font: { family: "Jost, sans-serif", size: 12 } },
      },
      tooltip: {
        backgroundColor: "rgba(255,255,255,0.95)",
        titleColor: "#191919",
        bodyColor: "#64748b",
        borderColor: "rgba(255,95,147,0.22)",
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
      },
    },
  }), []);

  // ── Static card config ──────────────────────────────────────────────────────

  const statsCards = [
    {
      title: "Total Products",
      value: dashboardData?.total_items ?? 0,
      subtitle: "Active SKUs",
      icon: faBox,
      colorClass: "stat-icon--blue",
      trend: "up",
      trendValue: "+5.2%",
    },
    {
      title: "Stock Value",
      value: formatCurrency(dashboardData?.total_stock_value ?? 0),
      subtitle: "Current inventory worth",
      icon: faWarehouse,
      colorClass: "stat-icon--green",
      trend: "up",
      trendValue: "+8.1%",
    },
    {
      title: "Low Stock Alert",
      value: dashboardData?.low_stock_items ?? 0,
      subtitle: "Items need reorder",
      icon: faExclamationTriangle,
      colorClass: "stat-icon--amber",
      trend: "up",
      trendValue: "+2",
      alert: true,
    },
    {
      title: "Out of Stock",
      value: dashboardData?.out_of_stock_items ?? 0,
      subtitle: "Unavailable items",
      icon: faChartLine,
      colorClass: "stat-icon--red",
      trend: "down",
      trendValue: "-1",
      alert: true,
    },
  ];

  const quickActions = [
    { icon: faPlus,     label: "Add Product", colorClass: "action-icon--pink"  },
    { icon: faSync,     label: "Sync Stock",  colorClass: "action-icon--green" },
    { icon: faDownload, label: "Export Data", colorClass: "action-icon--purple"},
    { icon: faBell,     label: "Alerts",      colorClass: "action-icon--amber", count: notifications.length },
  ];

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="advanced-inventory-loading">
        <div className="spinner" />
        <p className="theme-muted">Loading dashboard…</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="advanced-inventory-dashboard theme-page">

      {/* ── Header ── */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Advanced Inventory Management</h1>
          <p className="theme-muted">Real-time stock control, analytics, and optimization</p>
          {usingDemoData && <span className="demo-badge">Demo Mode — Sample Data</span>}
        </div>

        <div className="header-right">
          <div className="time-range-selector">
            {["24h", "7d", "30d"].map((range) => (
              <button
                key={range}
                className={timeRange === range ? "active" : ""}
                onClick={() => setTimeRange(range)}
              >
                {range === "24h" ? "24h" : range === "7d" ? "7 Days" : "30 Days"}
              </button>
            ))}
          </div>

          <button
            className="notification-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
          >
            <FontAwesomeIcon icon={faBell} />
            {notifications.length > 0 && (
              <span className="badge">{notifications.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Quick Actions ── */}
      <section className="quick-actions">
        {quickActions.map((action, i) => (
          <button key={i} className="action-card theme-card">
            <div className={`action-icon ${action.colorClass}`}>
              <FontAwesomeIcon icon={action.icon} />
            </div>
            <span>{action.label}</span>
            {action.count > 0 && (
              <span className="action-badge">{action.count}</span>
            )}
          </button>
        ))}
      </section>

      {/* ── Stat Cards ── */}
      <section className="stats-grid">
        {statsCards.map((stat, i) => (
          <div key={i} className={`stat-card theme-card${stat.alert ? " alert" : ""}`}>
            <div className={`stat-icon ${stat.colorClass}`}>
              <FontAwesomeIcon icon={stat.icon} />
            </div>
            <div className="stat-content">
              <h3>{stat.value}</h3>
              <p className="stat-title">{stat.title}</p>
              <p className="stat-subtitle theme-muted">{stat.subtitle}</p>
            </div>
            <div className={`stat-trend ${stat.trend}`}>
              <FontAwesomeIcon icon={stat.trend === "up" ? faArrowUp : faArrowDown} />
              <span>{stat.trendValue}</span>
            </div>
          </div>
        ))}
      </section>

      {/* ── Charts ── */}
      <section className="charts-grid">
        <div className="chart-card large theme-card">
          <div className="chart-header">
            <h3>Stock Level Trends</h3>
            <p className="theme-muted">Monitor inventory health over time</p>
          </div>
          <div className="chart-body">
            <Line data={stockTrendData} options={chartOptions} />
          </div>
        </div>

        <div className="chart-card theme-card">
          <div className="chart-header">
            <h3>Category Distribution</h3>
            <p className="theme-muted">Inventory by product category</p>
          </div>
          <div className="chart-body doughnut">
            <Doughnut data={categoryData} options={doughnutOptions} />
          </div>
        </div>
      </section>

      {/* ── Bottom Panels ── */}
      <section className="bottom-grid">

        {/* Top Moving Products */}
        <div className="panel-card theme-card">
          <div className="panel-header">
            <h3>Top Moving Products</h3>
            <button className="view-all theme-button">View All</button>
          </div>
          <div className="panel-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Sold</th>
                  <th>Revenue</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData?.top_moving_products?.map((product, i) => (
                  <tr key={i}>
                    <td>
                      <div className="product-cell">
                        <span className="product-rank">#{i + 1}</span>
                        <span className="product-name">{product.name}</span>
                      </div>
                    </td>
                    <td>{product.sold}</td>
                    <td>{formatCurrency(product.revenue)}</td>
                    <td>
                      <span className="trend-badge up">
                        <FontAwesomeIcon icon={STABLE_TRENDS[i].icon} />
                        {" "}{STABLE_TRENDS[i].value}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Stock Movements */}
        <div className="panel-card theme-card">
          <div className="panel-header">
            <h3>Recent Stock Movements</h3>
            <button className="view-all theme-button">View History</button>
          </div>
          <div className="panel-body">
            <div className="movement-list">
              {dashboardData?.recent_movements?.map((movement) => (
                <div key={movement.id} className="movement-item">
                  <div className={`movement-icon ${movement.type}`}>
                    <FontAwesomeIcon icon={MOVEMENT_ICON[movement.type]} />
                  </div>
                  <div className="movement-details">
                    <p className="movement-item-name">{movement.item}</p>
                    <p className="movement-meta theme-muted">
                      {MOVEMENT_LABEL[movement.type](movement.quantity)}
                      {" · "}{movement.user}{" · "}{movement.date}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </section>
    </div>
  );
};

export default AdvancedInventoryDashboard;
