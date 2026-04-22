"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { FormEvent, useEffect, useState } from "react";
import { API_BASE, apiLogin, apiRequest, formatDate, humanize } from "../../../lib/api";
import type { DashboardAlert, DashboardUser, Pagination } from "../../../lib/api";
import {
  ERROR_TOAST_DISMISS_MS,
  NOTICE_TOAST_DISMISS_MS,
  useAutoDismissMessage,
} from "../../../lib/useAutoDismissMessage";
import styles from "../../page.module.css";

const DEFAULT_AUTHORITY_PASSWORD = "authority@1";

type Violation = {
  id: string;
  speed: number;
  speedLimit: number;
  severity: string;
  violationType: string;
  violationTime: string;
  driver?: { user?: { fullName: string } };
  vehicle?: { registrationNumber: string };
  organization?: { name: string };
};

type RepeatOffender = {
  driver?: { user?: { fullName: string }; licenseNumber?: string; organization?: { name: string } } | null;
  violationCount: number;
  lastViolationAt?: string | null;
};

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  createdAt: string;
  user?: { fullName: string; role: string } | null;
};

type Authority = {
  id: string;
  name: string;
  type: string;
  status: string;
  _count?: {
    authorityUsers: number;
  };
};

type AuthorityUser = {
  id: string;
  role: "ADMIN" | "USER";
  status: string;
  createdAt: string;
  authority: Pick<Authority, "id" | "name" | "type" | "status">;
  user: {
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    role: string;
    status: string;
  };
};

type ReportFilters = {
  severity: string;
  startDate: string;
  endDate: string;
  page: number;
  limit: number;
};

const emptyFilters: ReportFilters = { severity: "", startDate: "", endDate: "", page: 1, limit: 25 };

type Section = "violations" | "offenders" | "alerts" | "users" | "audit";

function severityChipClass(s: string) {
  if (s === "CRITICAL") return `${styles.severityBadge} ${styles.severityCritical}`;
  if (s === "HIGH")     return `${styles.severityBadge} ${styles.severityHigh}`;
  if (s === "MEDIUM")   return `${styles.severityBadge} ${styles.severityMedium}`;
  return `${styles.severityBadge} ${styles.severityLow}`;
}

export default function AuthorityDashboard() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [token, setToken]           = useState<string | null>(null);
  const [user, setUser]             = useState<DashboardUser | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("violations");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [violations, setViolations]       = useState<Violation[]>([]);
  const [repeatOffenders, setRepeatOffenders] = useState<RepeatOffender[]>([]);
  const [alerts, setAlerts]     = useState<DashboardAlert[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [authorityUsers, setAuthorityUsers] = useState<AuthorityUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters]       = useState<ReportFilters>(emptyFilters);
  const [isLoading, setIsLoading]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [notice, setNotice]         = useState<string | null>(null);
  const [authorityUserForm, setAuthorityUserForm] = useState({
    authorityId: "",
    fullName: "",
    email: "",
    phone: "",
    role: "USER",
    password: DEFAULT_AUTHORITY_PASSWORD,
  });

  const canManageAuthorityUsers =
    user?.role === "SUPER_ADMIN" || user?.role === "STAFF" || user?.authorityUserRole === "ADMIN";

  useAutoDismissMessage(notice, setNotice, NOTICE_TOAST_DISMISS_MS);
  useAutoDismissMessage(error, setError, ERROR_TOAST_DISMISS_MS);

  const buildQuery = (f: ReportFilters) => {
    const p = new URLSearchParams();
    if (f.severity)  p.set("severity",  f.severity);
    if (f.startDate) p.set("startDate", f.startDate);
    if (f.endDate)   p.set("endDate",   f.endDate);
    p.set("page",  String(f.page));
    p.set("limit", String(f.limit));
    return p.toString();
  };

  const loadData = async (activeToken = token, f = filters) => {
    if (!activeToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const q = buildQuery(f);
      const [violRes, offRes, alertRes, authorityRes, authorityUserRes] = await Promise.all([
        fetch(`${API_BASE}/violations?${q}`, { headers: { Authorization: `Bearer ${activeToken}` } }).then((r) => r.json()),
        apiRequest<RepeatOffender[]>("/violations/repeat-offenders", activeToken),
        apiRequest<DashboardAlert[]>("/alerts", activeToken),
        apiRequest<Authority[]>("/authorities", activeToken).catch(() => []),
        apiRequest<AuthorityUser[]>("/authorities/users", activeToken).catch(() => []),
      ]);
      setViolations(violRes.data ?? []);
      setPagination(violRes.pagination ?? null);
      setRepeatOffenders(offRes);
      setAlerts(alertRes);
      setAuthorities(authorityRes);
      setAuthorityUsers(authorityUserRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditLogs = async (activeToken = token, page = 1) => {
    if (!activeToken) return;
    try {
      const res = await fetch(`${API_BASE}/audit-logs?page=${page}&limit=50`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      }).then((r) => r.json());
      setAuditLogs(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs.");
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await apiLogin(identifier, password);
      if (!["AUTHORITY", "SUPER_ADMIN", "STAFF"].includes(result.user.role)) {
        setError("This portal is for authority accounts only.");
        return;
      }
      setToken(result.token);
      setUser(result.user);
      localStorage.setItem("smartrans_token", result.token);
      localStorage.setItem("smartrans_user", JSON.stringify(result.user));
      await loadData(result.token, filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("smartrans_token");
    localStorage.removeItem("smartrans_user");
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

  const handleCreateAuthorityUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await apiRequest("/authorities/users", token, {
        method: "POST",
        body: JSON.stringify({
          authorityId: authorityUserForm.authorityId,
          fullName: authorityUserForm.fullName,
          email: authorityUserForm.email || undefined,
          phone: authorityUserForm.phone || undefined,
          role: authorityUserForm.role,
          password: authorityUserForm.password || undefined,
        }),
      });
      setNotice("Authority user created.");
      setAuthorityUserForm((current) => ({
        ...current,
        fullName: "",
        email: "",
        phone: "",
        role: "USER",
        password: DEFAULT_AUTHORITY_PASSWORD,
      }));
      await loadData(token, filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create authority user.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportCsv = async () => {
    if (!token) return;
    const q = buildQuery({ ...filters, page: 1, limit: 1000 });
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/reports/violations.csv?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Export failed: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `smartrans-violations-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("CSV export downloaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem("smartrans_token");
    const storedUser = localStorage.getItem("smartrans_user");
    if (stored && storedUser) {
      const u = JSON.parse(storedUser) as DashboardUser;
      if (["AUTHORITY", "SUPER_ADMIN", "STAFF"].includes(u.role)) {
        setToken(stored);
        setUser(u);
        void loadData(stored, filters);
      }
    }
  }, []);

  useEffect(() => {
    if (activeSection === "audit" && token) void loadAuditLogs(token);
  }, [activeSection, token]);

  useEffect(() => {
    setAuthorityUserForm((current) => ({
      ...current,
      authorityId: current.authorityId || authorities[0]?.id || "",
    }));
  }, [authorities]);

  /* ── Login screen ── */
  if (!token) {
    return (
      <main className={styles.main}>
        {/* Left branding panel */}
        <div className={styles.loginBrand}>
          <div className={styles.loginBrandTop}>
            <div className={styles.loginBrandMark}>ST</div>
            <h2 className={styles.loginBrandHeadline}>
              Authority<br /><em>enforcement portal</em>
            </h2>
            <p className={styles.loginBrandDesc}>
              Monitor speed violations, track repeat offenders, and review transport compliance across Ghana.
            </p>
          </div>
          <div className={styles.loginBrandFeatures}>
            {[
              "Real-time speed violation data",
              "Repeat offender identification",
              "Alert and notification centre",
              "Full audit log access",
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
              <p className={styles.loginTitle}>Authority portal</p>
              <p className={styles.loginSubtitle}>Sign in with your authority account</p>
            </div>

            {error && <p className={styles.errorBanner}>{error}</p>}

            <form onSubmit={handleLogin} className={styles.loginForm}>
              <label>
                <span>Email or phone</span>
                <input
                  placeholder="authority@dvla.gov.gh"
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

  const canViewAuditLogs = user?.role === "SUPER_ADMIN" || user?.role === "STAFF";
  const unreadCount = alerts.filter((a) => !a.isRead).length;
  const criticalCount = violations.filter((v) => v.severity === "CRITICAL").length;
  const highCount = violations.filter((v) => v.severity === "HIGH").length;

  const navItems: Array<{ id: Section; label: string; icon: string }> = [
    { id: "violations", label: "Violations", icon: "⚡" },
    { id: "offenders",  label: "Repeat offenders", icon: "↺" },
    { id: "alerts",     label: `Alerts${unreadCount > 0 ? ` (${unreadCount})` : ""}`, icon: "◦" },
    ...(canManageAuthorityUsers ? [{ id: "users" as Section, label: "Users", icon: "◎" }] : []),
    ...(canViewAuditLogs ? [{ id: "audit" as Section, label: "Audit logs", icon: "≡" }] : []),
  ];

  const shellClassName = [
    styles.shell,
    sidebarCollapsed ? styles.shellCollapsed : "",
    sidebarOpen ? styles.shellNavOpen : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClassName}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <div className={styles.brandMark}>ST</div>
          <div>
            <p className={styles.brandName}>SmarTrans</p>
            <p className={styles.brandRole}>Authority</p>
          </div>
          <button
            type="button"
            className={styles.sidebarToggle}
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!sidebarCollapsed}
          >
            ‹
          </button>
        </div>
        <nav className={styles.sidebarNav}>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ""}`}
              onClick={() => {
                setActiveSection(item.id);
                setSidebarOpen(false);
              }}
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
          <p className={styles.footerRole}>{humanize(user?.role ?? "")}</p>
          <button className={styles.logoutButton} onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <button
        type="button"
        className={styles.sidebarBackdrop}
        onClick={() => setSidebarOpen(false)}
        aria-label="Close navigation"
      />

      <main className={styles.content}>
        <div className={styles.mobileTopbar}>
          <button
            type="button"
            className={styles.mobileMenuButton}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            ☰
          </button>
          <span>Authority</span>
        </div>

        {notice && <div className={styles.noticeBanner}>{notice}</div>}
        {error  && <div className={styles.errorBanner}>{error}</div>}

        {activeSection === "violations" && (
          <section className={styles.sectionGrid}>
            {/* Header */}
            <div className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Authority dashboard</p>
                <h1 className={styles.pageHeading}>Speed violations</h1>
                <p className={styles.userLine}>
                  {pagination?.total ?? violations.length} total violations recorded
                </p>
              </div>
              <div className={styles.headerActions}>
                <button className={styles.secondaryButton} onClick={exportCsv} disabled={isLoading}>
                  ↓ Export CSV
                </button>
                <button className={styles.secondaryButton} onClick={() => loadData(token, filters)} disabled={isLoading}>
                  {isLoading ? "Loading…" : "↻ Refresh"}
                </button>
              </div>
            </div>

            {/* Stat strip */}
            <div className={styles.statStrip}>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>Total violations</p>
                <p className={styles.statCardValue}>{pagination?.total ?? violations.length}</p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>Critical</p>
                <p className={styles.statCardValue} style={{ color: "var(--red)" }}>{criticalCount}</p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>High</p>
                <p className={styles.statCardValue} style={{ color: "#F97316" }}>{highCount}</p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statCardLabel}>Repeat offenders</p>
                <p className={styles.statCardValue}>{repeatOffenders.length}</p>
              </div>
            </div>

            {/* Filter bar */}
            <div className={styles.filterRow}>
              <select
                className={styles.filterSelect}
                value={filters.severity}
                onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value, page: 1 }))}
              >
                <option value="">All severities</option>
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                  <option key={s} value={s}>{humanize(s)}</option>
                ))}
              </select>
              <input
                className={styles.filterInput}
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value, page: 1 }))}
              />
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>to</span>
              <input
                className={styles.filterInput}
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value, page: 1 }))}
              />
              <button className={styles.primaryButton} style={{ minHeight: 40 }} onClick={() => loadData(token, filters)}>
                Apply
              </button>
              <button
                className={styles.secondaryButton}
                style={{ minHeight: 40 }}
                onClick={() => { setFilters(emptyFilters); void loadData(token, emptyFilters); }}
              >
                Clear
              </button>
            </div>

            {/* Table */}
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Vehicle</th>
                    <th>Organisation</th>
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
                      <td>{v.organization?.name ?? "—"}</td>
                      <td style={{ fontWeight: 800 }}>{Math.round(v.speed)} km/h</td>
                      <td style={{ color: "var(--text-muted)" }}>{Math.round(v.speedLimit)} km/h</td>
                      <td><span className={severityChipClass(v.severity)}>{humanize(v.severity)}</span></td>
                      <td>{humanize(v.violationType)}</td>
                      <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{formatDate(v.violationTime)}</td>
                    </tr>
                  ))}
                  {violations.length === 0 && (
                    <tr><td colSpan={8} className={styles.emptyState}>No violations found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className={styles.paginationRow}>
                <button
                  className={styles.secondaryButton}
                  style={{ minHeight: 36 }}
                  disabled={filters.page <= 1}
                  onClick={() => { const n = { ...filters, page: filters.page - 1 }; setFilters(n); void loadData(token, n); }}
                >
                  ← Previous
                </button>
                <span className={styles.paginationInfo}>
                  Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
                </span>
                <button
                  className={styles.secondaryButton}
                  style={{ minHeight: 36 }}
                  disabled={filters.page >= pagination.totalPages}
                  onClick={() => { const n = { ...filters, page: filters.page + 1 }; setFilters(n); void loadData(token, n); }}
                >
                  Next →
                </button>
              </div>
            )}
          </section>
        )}

        {activeSection === "offenders" && (
          <section className={styles.sectionGrid}>
            <div className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Risk monitoring</p>
                <h1 className={styles.pageHeading}>Repeat offenders</h1>
                <p className={styles.userLine}>{repeatOffenders.length} drivers with multiple violations</p>
              </div>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>License</th>
                    <th>Organisation</th>
                    <th>Violations</th>
                    <th>Last violation</th>
                  </tr>
                </thead>
                <tbody>
                  {repeatOffenders.map((o, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{o.driver?.user?.fullName ?? "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{o.driver?.licenseNumber ?? "—"}</td>
                      <td>{o.driver?.organization?.name ?? "—"}</td>
                      <td>
                        <span className={o.violationCount >= 5 ? `${styles.chipRed}` : `${styles.chipAmber}`}>
                          {o.violationCount} violation{o.violationCount !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{formatDate(o.lastViolationAt)}</td>
                    </tr>
                  ))}
                  {repeatOffenders.length === 0 && (
                    <tr><td colSpan={5} className={styles.emptyState}>No repeat offenders.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeSection === "alerts" && (
          <section className={styles.sectionGridSm}>
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
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {!alert.isRead && <span className={styles.unreadDot} />}
                      <span className={styles.alertMeta}>{humanize(alert.deliveryChannel)}</span>
                    </div>
                  </div>
                  <p className={styles.alertMessage}>{alert.message}</p>
                  <p className={styles.alertMeta}>{formatDate(alert.createdAt)}</p>
                </div>
              ))}
              {alerts.length === 0 && <p className={styles.emptyState}>No alerts.</p>}
            </div>
          </section>
        )}

        {activeSection === "users" && canManageAuthorityUsers && (
          <section className={styles.managementGrid}>
            <form className={styles.formPanel} onSubmit={handleCreateAuthorityUser}>
              <div>
                <p className={styles.eyebrow}>Authority admin</p>
                <h2>Create authority user</h2>
              </div>
              <div className={styles.formGrid}>
                <label className={styles.fullField}>
                  <span>Authority</span>
                  <select
                    required
                    value={authorityUserForm.authorityId}
                    onChange={(e) => setAuthorityUserForm({ ...authorityUserForm, authorityId: e.target.value })}
                  >
                    {authorities.map((authority) => (
                      <option key={authority.id} value={authority.id}>
                        {authority.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Full name</span>
                  <input
                    required
                    value={authorityUserForm.fullName}
                    onChange={(e) => setAuthorityUserForm({ ...authorityUserForm, fullName: e.target.value })}
                  />
                </label>
                <label>
                  <span>Role</span>
                  <select
                    value={authorityUserForm.role}
                    onChange={(e) => setAuthorityUserForm({ ...authorityUserForm, role: e.target.value })}
                  >
                    <option value="USER">User</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={authorityUserForm.email}
                    onChange={(e) => setAuthorityUserForm({ ...authorityUserForm, email: e.target.value })}
                  />
                </label>
                <label>
                  <span>Phone</span>
                  <input
                    value={authorityUserForm.phone}
                    onChange={(e) => setAuthorityUserForm({ ...authorityUserForm, phone: e.target.value })}
                  />
                </label>
                <label className={styles.fullField}>
                  <span>Password</span>
                  <input
                    type="password"
                    placeholder={DEFAULT_AUTHORITY_PASSWORD}
                    value={authorityUserForm.password}
                    onChange={(e) => setAuthorityUserForm({ ...authorityUserForm, password: e.target.value })}
                  />
                </label>
              </div>
              <button className={styles.primaryAction} disabled={isSubmitting || authorities.length === 0} type="submit">
                {isSubmitting ? "Creating…" : "Create user"}
              </button>
            </form>

            <article className={styles.tablePanel}>
              <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                <div>
                  <p className={styles.eyebrow}>Authority access</p>
                  <h2>Users ({authorityUsers.length})</h2>
                </div>
              </div>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Authority</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {authorityUsers.map((authorityUser) => (
                      <tr key={authorityUser.id}>
                        <td style={{ fontWeight: 800 }}>{authorityUser.user.fullName}</td>
                        <td>{authorityUser.authority.name}</td>
                        <td>
                          <span className={authorityUser.role === "ADMIN" ? styles.chipGreen : styles.chipAmber}>
                            {humanize(authorityUser.role)}
                          </span>
                        </td>
                        <td><span className={styles.statusPill}>{humanize(authorityUser.status)}</span></td>
                        <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                          {authorityUser.user.email ?? authorityUser.user.phone ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {authorityUsers.length === 0 && (
                      <tr><td colSpan={5} className={styles.emptyState}>No authority users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {activeSection === "audit" && (
          <section className={styles.sectionGrid}>
            <div className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Compliance</p>
                <h1 className={styles.pageHeading}>Audit logs</h1>
                <p className={styles.userLine}>{auditLogs.length} entries loaded</p>
              </div>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontWeight: 800 }}>{log.action}</td>
                      <td><span className={styles.chipAmber}>{log.entityType}</span></td>
                      <td>{log.user?.fullName ?? "System"}</td>
                      <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{log.user ? humanize(log.user.role) : "—"}</td>
                      <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{formatDate(log.createdAt)}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr><td colSpan={5} className={styles.emptyState}>No audit logs.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
