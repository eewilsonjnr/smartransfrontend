"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiLogin, apiRequest, formatDate, humanize } from "../../../lib/api";
import type { DashboardAlert, DashboardUser } from "../../../lib/api";
import {
  ERROR_TOAST_DISMISS_MS,
  NOTICE_TOAST_DISMISS_MS,
  useAutoDismissMessage,
} from "../../../lib/useAutoDismissMessage";
import styles from "../../page.module.css";

type Vehicle = {
  id: string;
  registrationNumber: string;
  vehicleType: string;
  status: string;
  make?: string | null;
  model?: string | null;
  color?: string | null;
};

type Trip = {
  id: string;
  status: string;
  startTime: string;
  endTime?: string | null;
  maxSpeed?: number | null;
  averageSpeed?: number | null;
  distance?: number | null;
  driver?: { user?: { fullName: string } };
  vehicle?: Vehicle;
  _count?: { violations: number; locations: number };
};

type Violation = {
  id: string;
  speed: number;
  speedLimit: number;
  severity: string;
  violationType: string;
  violationTime: string;
  driver?: { user?: { fullName: string } };
  vehicle?: Vehicle;
};

type Section = "fleet" | "trips" | "violations" | "alerts";

function vehicleTypeIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes("bus") || t.includes("trotro")) return "🚌";
  if (t.includes("taxi"))  return "🚕";
  if (t.includes("truck")) return "🚛";
  return "🚐";
}

function statusChip(s: string) {
  if (s === "ACTIVE")    return styles.chipGreen;
  if (s === "SUSPENDED") return styles.chipRed;
  return styles.chipAmber;
}

function severityChip(s: string) {
  if (s === "CRITICAL") return `${styles.severityBadge} ${styles.severityCritical}`;
  if (s === "HIGH")     return `${styles.severityBadge} ${styles.severityHigh}`;
  if (s === "MEDIUM")   return `${styles.severityBadge} ${styles.severityMedium}`;
  return `${styles.severityBadge} ${styles.severityLow}`;
}

export default function OwnerDashboard() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [token, setToken]           = useState<string | null>(null);
  const [user, setUser]             = useState<DashboardUser | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("fleet");
  const [vehicles, setVehicles]     = useState<Vehicle[]>([]);
  const [trips, setTrips]           = useState<Trip[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [alerts, setAlerts]         = useState<DashboardAlert[]>([]);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [notice, setNotice]         = useState<string | null>(null);
  const [tripPage, setTripPage]     = useState(1);

  useAutoDismissMessage(notice, setNotice, NOTICE_TOAST_DISMISS_MS);
  useAutoDismissMessage(error, setError, ERROR_TOAST_DISMISS_MS);

  const loadData = async (activeToken = token) => {
    if (!activeToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [veh, trp, viol, alrt] = await Promise.all([
        apiRequest<Vehicle[]>("/vehicles", activeToken),
        apiRequest<Trip[]>("/trips", activeToken),
        apiRequest<{ data: Violation[] }>("/violations?limit=50", activeToken),
        apiRequest<DashboardAlert[]>("/alerts", activeToken),
      ]);
      setVehicles(veh);
      setTrips(trp);
      setViolations((viol as unknown as { data: Violation[] }).data ?? (viol as unknown as Violation[]));
      setAlerts(alrt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await apiLogin(identifier, password);
      if (!["CAR_OWNER", "SUPER_ADMIN"].includes(result.user.role)) {
        setError("This portal is for vehicle owner accounts.");
        return;
      }
      setToken(result.token);
      setUser(result.user);
      localStorage.setItem("smartrans_owner_token", result.token);
      localStorage.setItem("smartrans_owner_user", JSON.stringify(result.user));
      await loadData(result.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("smartrans_owner_token");
    localStorage.removeItem("smartrans_owner_user");
  };

  const handleMarkAlertRead = async (alertId: string) => {
    if (!token) return;
    try {
      await apiRequest(`/alerts/${alertId}/read`, token, { method: "PATCH" });
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, isRead: true } : a)));
    } catch { /* non-critical */ }
  };

  const handleMarkAllRead = async () => {
    if (!token) return;
    try {
      await apiRequest("/alerts/read-all", token, { method: "PATCH" });
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
      setNotice("All alerts marked as read.");
    } catch { /* non-critical */ }
  };

  useEffect(() => {
    const stored = localStorage.getItem("smartrans_owner_token");
    const storedUser = localStorage.getItem("smartrans_owner_user");
    if (stored && storedUser) {
      const u = JSON.parse(storedUser) as DashboardUser;
      if (["CAR_OWNER", "SUPER_ADMIN"].includes(u.role)) {
        setToken(stored);
        setUser(u);
        void loadData(stored);
      }
    }
  }, []);

  const TRIPS_PER_PAGE = 10;
  const pagedTrips = trips.slice((tripPage - 1) * TRIPS_PER_PAGE, tripPage * TRIPS_PER_PAGE);
  const tripPages  = Math.ceil(trips.length / TRIPS_PER_PAGE);
  const unreadCount = alerts.filter((a) => !a.isRead).length;
  const activeVehicles = vehicles.filter((v) => v.status === "ACTIVE").length;
  const completedTrips = trips.filter((t) => t.status === "COMPLETED").length;
  const totalViolations = violations.length;

  /* ── Login screen ── */
  if (!token) {
    return (
      <main className={styles.main}>
        {/* Left branding panel */}
        <div className={styles.loginBrand}>
          <div className={styles.loginBrandTop}>
            <div className={styles.loginBrandMark}>ST</div>
            <h2 className={styles.loginBrandHeadline}>
              Your fleet,<br /><em>your visibility</em>
            </h2>
            <p className={styles.loginBrandDesc}>
              Track your vehicles in real time, review trip history, and stay on top of driver performance.
            </p>
          </div>
          <div className={styles.loginBrandFeatures}>
            {[
              "Monitor all your registered vehicles",
              "Full trip history with speed data",
              "Driver violation summaries",
              "Instant alert notifications",
            ].map((f) => (
              <div key={f} className={styles.loginBrandFeature}>
                <span className={styles.loginBrandFeatureDot} />
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* Right form */}
        <div className={styles.loginCard}>
          <div className={styles.loginCardInner}>
            <div className={styles.loginCardLogo}>
              <div className={styles.loginCardMark}>ST</div>
              <p className={styles.loginTitle}>Owner portal</p>
              <p className={styles.loginSubtitle}>Sign in to manage your fleet</p>
            </div>

            {error && <p className={styles.errorBanner}>{error}</p>}

            <form onSubmit={handleLogin} className={styles.loginForm}>
              <label>
                <span>Email or phone</span>
                <input
                  placeholder="owner@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </label>
              <label>
                <span>Password</span>
                <div className={styles.passwordWrap}>
                  <input
                    placeholder="••••••••"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className={styles.passwordToggle} onClick={() => setShowPw((v) => !v)}>
                    {showPw ? "🙈" : "👁"}
                  </button>
                </div>
              </label>
              <button type="submit">Sign in →</button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const navItems: Array<{ id: Section; label: string; icon: string }> = [
    { id: "fleet",      label: "My fleet",   icon: "🚌" },
    { id: "trips",      label: "Trip history", icon: "⌁" },
    { id: "violations", label: "Violations",  icon: "⚡" },
    { id: "alerts",     label: `Alerts${unreadCount > 0 ? ` (${unreadCount})` : ""}`, icon: "◦" },
  ];

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <div className={styles.brandMark}>ST</div>
          <div>
            <p className={styles.brandName}>SmarTrans</p>
            <p className={styles.brandRole}>Owner portal</p>
          </div>
        </div>
        <nav className={styles.sidebarNav}>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ""}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
              {item.id === "alerts" && unreadCount > 0 && (
                <span className={styles.navBadge}>{unreadCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <p className={styles.footerUser}>{user?.fullName}</p>
          <p className={styles.footerRole}>Vehicle owner</p>
          <button className={styles.logoutButton} onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main className={styles.content}>
        {notice && <div className={styles.noticeBanner}>{notice}</div>}
        {error  && <div className={styles.errorBanner}>{error}</div>}

        {activeSection === "fleet" && (
          <section style={{ display: "grid", gap: 20 }}>
            {/* Page header */}
            <div className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Fleet management</p>
                <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: -0.6 }}>My vehicles</h1>
                <p className={styles.userLine}>Welcome back, <strong>{user?.fullName}</strong></p>
              </div>
              <div className={styles.headerActions}>
                <button className={styles.secondaryButton} onClick={() => loadData(token)} disabled={isLoading}>
                  {isLoading ? "Loading…" : "↻ Refresh"}
                </button>
              </div>
            </div>

            {/* Stat strip */}
            <div className={styles.statStrip}>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>Total vehicles</p>
                <p className={styles.statCardValue}>{vehicles.length}</p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>Active</p>
                <p className={styles.statCardValue} style={{ color: "var(--green-dark)" }}>{activeVehicles}</p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>Trips completed</p>
                <p className={styles.statCardValue}>{completedTrips}</p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>Violations</p>
                <p className={styles.statCardValue} style={{ color: totalViolations > 0 ? "var(--red)" : "var(--text-dark)" }}>{totalViolations}</p>
              </div>
            </div>

            {/* Vehicle cards */}
            {vehicles.length > 0 ? (
              <div className={styles.ownerVehicleGrid}>
                {vehicles.map((v) => {
                  const vTrips = trips.filter((t) => t.vehicle?.id === v.id);
                  const vViolations = violations.filter((vl) => vl.vehicle?.id === v.id);
                  return (
                    <div key={v.id} className={styles.ownerVehicleCard}>
                      <div className={styles.ownerVehicleCardTop}>
                        <div className={styles.ownerVehicleIcon}>{vehicleTypeIcon(v.vehicleType)}</div>
                        <div style={{ minWidth: 0 }}>
                          <p className={styles.ownerVehiclePlate}>{v.registrationNumber}</p>
                          <p className={styles.ownerVehicleType}>{v.vehicleType}</p>
                        </div>
                      </div>
                      <div className={styles.ownerVehicleCardBody}>
                        {[
                          { label: "Make / Model", value: [v.make, v.model].filter(Boolean).join(" ") || "—" },
                          { label: "Colour",       value: v.color ?? "—" },
                          { label: "Trips",        value: String(vTrips.length) },
                          { label: "Violations",   value: String(vViolations.length) },
                        ].map(({ label, value }) => (
                          <div key={label} className={styles.ownerVehicleField}>
                            <span className={styles.ownerVehicleFieldLabel}>{label}</span>
                            <span
                              className={styles.ownerVehicleFieldValue}
                              style={label === "Violations" && vViolations.length > 0 ? { color: "var(--red)" } : undefined}
                            >
                              {value}
                            </span>
                          </div>
                        ))}
                        <div style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                          <span className={`${statusChip(v.status)}`}>{humanize(v.status)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.emptyState}>No vehicles registered to your account.</p>
            )}
          </section>
        )}

        {activeSection === "trips" && (
          <section style={{ display: "grid", gap: 20 }}>
            <div className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Fleet activity</p>
                <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: -0.6 }}>Trip history</h1>
                <p className={styles.userLine}>{trips.length} trips across all vehicles</p>
              </div>
            </div>

            {/* Summary */}
            <div className={styles.statStrip}>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>Total trips</p>
                <p className={styles.statCardValue}>{trips.length}</p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>In progress</p>
                <p className={styles.statCardValue} style={{ color: "var(--green-dark)" }}>
                  {trips.filter((t) => t.status === "IN_PROGRESS").length}
                </p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>Completed</p>
                <p className={styles.statCardValue}>{completedTrips}</p>
              </div>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Max speed</th>
                    <th>Distance</th>
                    <th>Violations</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTrips.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 700, letterSpacing: 0.3 }}>{t.vehicle?.registrationNumber ?? "—"}</td>
                      <td>{t.driver?.user?.fullName ?? "—"}</td>
                      <td>
                        <span className={
                          t.status === "IN_PROGRESS" ? styles.chipGreen :
                          t.status === "COMPLETED"   ? styles.chipAmber : styles.chipRed
                        }>{humanize(t.status)}</span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(t.startTime)}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(t.endTime)}</td>
                      <td style={{ fontWeight: 700 }}>{t.maxSpeed ? `${Math.round(t.maxSpeed)} km/h` : "—"}</td>
                      <td>{t.distance ? `${t.distance.toFixed(1)} km` : "—"}</td>
                      <td>
                        {(t._count?.violations ?? 0) > 0
                          ? <span className={styles.chipRed}>{t._count?.violations}</span>
                          : <span style={{ color: "var(--text-muted)" }}>0</span>
                        }
                      </td>
                    </tr>
                  ))}
                  {trips.length === 0 && (
                    <tr><td colSpan={8} className={styles.emptyState}>No trips recorded.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {tripPages > 1 && (
              <div className={styles.paginationRow}>
                <button
                  className={styles.secondaryButton}
                  style={{ minHeight: 36 }}
                  disabled={tripPage <= 1}
                  onClick={() => setTripPage((p) => p - 1)}
                >
                  ← Previous
                </button>
                <span className={styles.paginationInfo}>Page {tripPage} of {tripPages}</span>
                <button
                  className={styles.secondaryButton}
                  style={{ minHeight: 36 }}
                  disabled={tripPage >= tripPages}
                  onClick={() => setTripPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </section>
        )}

        {activeSection === "violations" && (
          <section style={{ display: "grid", gap: 20 }}>
            <div className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Compliance</p>
                <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: -0.6 }}>Violations</h1>
                <p className={styles.userLine}>{violations.length} violations across your fleet</p>
              </div>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Vehicle</th>
                    <th>Speed</th>
                    <th>Limit</th>
                    <th>Severity</th>
                    <th>Type</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 700 }}>{v.driver?.user?.fullName ?? "—"}</td>
                      <td style={{ fontWeight: 700, letterSpacing: 0.3 }}>{v.vehicle?.registrationNumber ?? "—"}</td>
                      <td style={{ fontWeight: 800 }}>{Math.round(v.speed)} km/h</td>
                      <td style={{ color: "var(--text-muted)" }}>{Math.round(v.speedLimit)} km/h</td>
                      <td><span className={severityChip(v.severity)}>{humanize(v.severity)}</span></td>
                      <td>{humanize(v.violationType)}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(v.violationTime)}</td>
                    </tr>
                  ))}
                  {violations.length === 0 && (
                    <tr><td colSpan={7} className={styles.emptyState}>No violations recorded.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeSection === "alerts" && (
          <section style={{ display: "grid", gap: 20 }}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>Notification centre</p>
                <h2 className={styles.sectionTitle}>
                  Alerts
                  {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
                </h2>
              </div>
              {unreadCount > 0 && (
                <button className={styles.secondaryButton} onClick={handleMarkAllRead}>
                  Mark all read
                </button>
              )}
            </div>
            <div className={styles.alertList}>
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`${styles.alertItem} ${!alert.isRead ? styles.alertUnread : ""}`}
                  onClick={() => !alert.isRead && handleMarkAlertRead(alert.id)}
                >
                  <div className={styles.alertHeader}>
                    <span className={styles.alertType}>{humanize(alert.alertType)}</span>
                    {!alert.isRead && <span className={styles.unreadDot} />}
                  </div>
                  <p className={styles.alertMessage}>{alert.message}</p>
                  <p className={styles.alertMeta}>{formatDate(alert.createdAt)}</p>
                </div>
              ))}
              {alerts.length === 0 && <p className={styles.emptyState}>No alerts.</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
