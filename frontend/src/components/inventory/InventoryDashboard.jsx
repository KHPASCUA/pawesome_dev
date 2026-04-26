import React, { useState, useEffect, useMemo } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoon,
  faSun,
  faUserCircle,
  faCalendarAlt,
  faBox,
} from "@fortawesome/free-solid-svg-icons";
import InventorySidebar from "./InventorySidebar";
import RoleAwareChatbot from "../chatbot/RoleAwareChatbot";
import NotificationDropdown from "../shared/NotificationDropdown";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import "./InventoryDashboard.css";

// ── Demo data for fallback ───────────────────────────────────────────────────────
const demoDashboardData = {
  total_items: 12,
  low_stock_items: 2,
  out_of_stock_items: 0,
  total_stock_value: 12500.50,
  recent_transactions: [
    { action: "Stock Added", item_name: "Classic Crispy Burger", quantity: 24, created_at: new Date().toISOString(), status: "completed" },
    { action: "Stock Removed", item_name: "Chocolate Milkshake", quantity: 5, created_at: new Date(Date.now() - 86400000).toISOString(), status: "completed" },
    { action: "Stock Added", item_name: "Spicy Chicken Sandwich", quantity: 14, created_at: new Date(Date.now() - 172800000).toISOString(), status: "completed" },
    { action: "Stock Adjusted", item_name: "Garden Salad", quantity: -3, created_at: new Date(Date.now() - 259200000).toISOString(), status: "completed" }
  ]
};

const InventoryDashboard = () => {
  const name = localStorage.getItem("name") || "Inventory Manager";
  const [theme, setTheme] = useState("light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const location = useLocation();

  const normalizedPath = location.pathname.replace(/\/+$/, "");
  const showOverview = normalizedPath === "/inventory";

  // Fetch dashboard data from backend
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const data = await apiRequest("/inventory/dashboard");
        if (data && data.total_items !== undefined) {
          setDashboardData(data);
        } else {
          // Fallback to demo data if API returns empty
          setDashboardData(demoDashboardData);
        }
      } catch (err) {
        console.error("Inventory dashboard fetch error:", err);
        // Fallback to demo data on error
        setDashboardData(demoDashboardData);
      }
    };

    if (showOverview) {
      fetchDashboardData();
      
      // Auto-refresh every 30 seconds for live data
      const interval = setInterval(() => {
        fetchDashboardData();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [showOverview]);

  // ── Summary cards configuration ─────────────────────────────────────────────────
  const summaryCards = useMemo(() => dashboardData ? [
    {
      title: "Total Products",
      value: dashboardData.total_items || 0,
      subtitle: "In inventory",
      change: "",
      iconClass: "overview-icon--blue",
    },
    {
      title: "Low Stock Items",
      value: dashboardData.low_stock_items || 0,
      subtitle: "Need reorder",
      change: "",
      iconClass: "overview-icon--amber",
      alert: true,
    },
    {
      title: "Out of Stock",
      value: dashboardData.out_of_stock_items || 0,
      subtitle: "Items",
      change: "",
      iconClass: "overview-icon--red",
      alert: true,
    },
    {
      title: "Stock Value",
      value: formatCurrency(dashboardData.total_stock_value || 0),
      subtitle: "Total value",
      change: "",
      iconClass: "overview-icon--green",
    },
  ] : [], [dashboardData]);

  // ── Recent activity mapping ─────────────────────────────────────────────────────
  const recentActivity = useMemo(() => dashboardData ? (dashboardData.recent_transactions || []).map((transaction) => ({
    action: transaction.action || "Transaction",
    product: transaction.item_name || "Item",
    quantity: transaction.quantity || 0,
    time: new Date(transaction.created_at).toLocaleDateString(),
    status: transaction.status || "completed",
  })) : [], [dashboardData]);

  return (
    <div className={`inventory-dashboard theme-page ${theme} ${sidebarCollapsed ? "collapsed" : ""}`}>
      <InventorySidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      <main className="inventory-main">
        <header className="inventory-navbar top-navbar theme-card">
          <div className="navbar-left">
            <h1 className="theme-heading">Inventory Management</h1>
            <p className="theme-muted">Monitor stock levels and manage warehouse operations</p>
          </div>

          <div className="search-group">
            <input
              type="text"
              placeholder="Search products, suppliers, orders..."
            />
          </div>

          <div className="navbar-actions">
            <NavLink to="/inventory/profile" className="inventory-profile-btn">
              <span className="profile-avatar-icon">
                <FontAwesomeIcon icon={faUserCircle} />
              </span>
              <span className="profile-info">
                <span className="profile-action-name">{name}</span>
                <span className="profile-action-role">Inventory</span>
              </span>
            </NavLink>

            <NotificationDropdown />

            <button
              className="theme-toggle-btn"
              type="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              <FontAwesomeIcon icon={theme === "light" ? faMoon : faSun} />
            </button>
          </div>
        </header>

        {showOverview ? (
          <>
            <section className="overview-cards">
              {summaryCards.map((card) => (
                <div key={card.title} className={`overview-card theme-card${card.alert ? " alert" : ""}`}>
                  <div className={`overview-icon ${card.iconClass}`}>
                    <FontAwesomeIcon icon={faBox} />
                  </div>
                  <div className="overview-content">
                    <h3>{card.value}</h3>
                    <p className="overview-title">{card.title}</p>
                    <p className="overview-subtitle theme-muted">{card.subtitle}</p>
                  </div>
                </div>
              ))}
            </section>

            <section className="dashboard-grid">
              <article className="panel overview-panel theme-card">
                <div className="panel-header">
                  <div>
                    <h2>Recent Activity</h2>
                    <p className="theme-muted">Latest inventory movements and updates</p>
                  </div>
                  <span className="badge live-badge">Live</span>
                </div>
                <div className="activity-list">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="activity-item">
                      <div className="activity-header">
                        <div className="activity-info">
                          <h3>{activity.action}</h3>
                          <p>{activity.product}</p>
                        </div>
                        <div className="activity-quantity">
                          <strong>{activity.quantity} units</strong>
                          <span className={`status-badge ${activity.status}`}>
                            {activity.status}
                          </span>
                        </div>
                      </div>
                      <div className="activity-details">
                        <span>
                          <FontAwesomeIcon icon={faBox} /> {activity.quantity} units
                        </span>
                        <span>
                          <FontAwesomeIcon icon={faCalendarAlt} /> {activity.time}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel quick-stat-panel theme-card">
                <div className="metric-card metric-card--accent theme-card">
                  <h3>{dashboardData?.expiring_soon || 0}</h3>
                  <p>Expiring Soon</p>
                  <small className="theme-muted">Within 30 days</small>
                </div>

                <div className="metric-card theme-card">
                  <h3>{dashboardData?.low_stock_items || 0}</h3>
                  <p>Low Stock Alerts</p>
                </div>

                <div className="metric-card theme-card">
                  <h3>{dashboardData?.inventory_changes_today || 0}</h3>
                  <p>Changes Today</p>
                </div>
              </article>
            </section>

            <section className="dashboard-bottom">
              <div className="panel stock-panel theme-card">
                <div className="panel-header space-between">
                  <div>
                    <h2>Stock Status</h2>
                  </div>
                  <NavLink to="/inventory/stock" className="see-all-link theme-button">
                    View all products
                  </NavLink>
                </div>

                <div className="stock-categories">
                  {(dashboardData?.critical_items || []).slice(0, 3).map((item, idx) => (
                    <div key={idx} className="stock-category-item">
                      <div className="category-icon">
                        <FontAwesomeIcon icon={faBox} />
                      </div>
                      <div className="category-info">
                        <h4>{item.name}</h4>
                        <p>{item.stock} units remaining</p>
                      </div>
                      <div className="category-status">
                        <div className={`status-indicator ${item.stock === 0 ? 'danger' : item.stock <= item.reorder_level ? 'warning' : 'good'}`}></div>
                        <span>{item.stock === 0 ? 'Out of Stock' : item.stock <= item.reorder_level ? 'Low Stock' : 'In Stock'}</span>
                      </div>
                    </div>
                  ))}
                  {(dashboardData?.critical_items || []).length === 0 && (
                    <p className="no-data">No critical stock items</p>
                  )}
                </div>
              </div>

              <div className="panel performance-panel theme-card">
                <div className="panel-header space-between">
                  <div>
                    <h2>Inventory Analytics</h2>
                  </div>
                  <NavLink to="/inventory/reports" className="see-all-link theme-button">
                    View reports
                  </NavLink>
                </div>
                
                <div className="inventory-metrics">
                  <div className="status-card status-card--success theme-card">
                    <strong>{dashboardData?.total_items || 0}</strong>
                    <p>Total Products</p>
                    <small className="theme-muted">{dashboardData?.out_of_stock_items || 0} out of stock</small>
                  </div>
                  <div className="status-card status-card--warning theme-card">
                    <strong>{dashboardData?.low_stock_items || 0}</strong>
                    <p>Low Stock Items</p>
                    <small className="theme-muted">Need attention</small>
                  </div>
                </div>
                
                <div className="inventory-summary theme-card">
                  <p className="theme-muted">Total stock value: {formatCurrency(dashboardData?.total_stock_value || 0)}</p>
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="dashboard-content">
            <Outlet />
          </section>
        )}
      </main>
      <RoleAwareChatbot
        mode="widget"
        title="Inventory Assistant"
        subtitle="Stock guidance, navigation, and inventory help"
      />
    </div>
  );
};

export default InventoryDashboard;
