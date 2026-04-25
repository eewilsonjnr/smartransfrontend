"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { FormEvent, useEffect, useState } from "react";
import { API_BASE, apiLogin, apiRequest, formatDate, humanize } from "../../../lib/api";
import type { DashboardAlert, DashboardUser } from "../../../lib/api";
import {
  ERROR_TOAST_DISMISS_MS,
  NOTICE_TOAST_DISMISS_MS,
  useAutoDismissMessage,
} from "../../../lib/useAutoDismissMessage";
import styles from "../../page.module.css";

// ── Types ────────────────────────────────────────────────────────────────────

type Organization = {
  id: string;
  name: string;
  type: string;
  status: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  speedLimit?: number | null;
  _count?: { drivers: number; vehicles: number; trips: number; violations: number };
};

type Driver = {
  id: string;
  licenseNumber: string;
  consentGiven: boolean;
  status: string;
  user: { id: string; fullName: string; email?: string | null; phone?: string | null };
  organization: Organization;
};

type OwnerOrganization = Pick<Organization, "id" | "name" | "type" | "status">;

type CarOwner = {
  id: string;
  address?: string | null;
  user: {
    id?: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    organizationUsers?: Array<{ organization: OwnerOrganization }>;
  };
  vehicles?: Array<{
    id: string;
    organizationId: string;
    registrationNumber: string;
    organization?: OwnerOrganization;
  }>;
  _count?: { vehicles: number; trips?: number; violations?: number };
};

type Vehicle = {
  id: string;
  registrationNumber: string;
  vehicleType: string;
  status: string;
  make?: string | null;
  model?: string | null;
  color?: string | null;
  organization?: Organization;
  carOwner?: CarOwner;
};

type Assignment = {
  id: string;
  isActive: boolean;
  assignedAt: string;
  driver: Driver;
  vehicle: Vehicle;
};

type RouteTemplate = {
  id: string;
  organizationId: string;
  name: string;
  origin: string;
  destination: string;
  estimatedDistanceKm?: number | null;
  estimatedDurationMinutes?: number | null;
  speedLimit?: number | null;
  status: string;
  organization?: Organization;
  _count?: { trips: number };
};

type Trip = {
  id: string;
  status: string;
  startTime: string;
  endTime?: string | null;
  maxSpeed?: number | null;
  averageSpeed?: number | null;
  distance?: number | null;
  driver?: Driver;
  vehicle?: Vehicle;
  organization?: Organization;
  routeTemplate?: RouteTemplate | null;
  _count?: { violations: number; locations: number };
};

type Violation = {
  id: string;
  speed: number;
  speedLimit: number;
  severity: string;
  violationType: string;
  violationTime: string;
  driver?: Driver;
  vehicle?: Vehicle;
  organization?: Organization;
};

type Pagination = { page: number; totalPages: number; total: number };

type Section = "overview" | "users" | "people" | "routes" | "fleet" | "trips" | "violations" | "alerts";

type OrgUser = {
  id: string;
  role: string;
  status: string;
  organization?: { id: string; name: string };
  user: { id: string; fullName: string; email?: string | null; phone?: string | null };
};

const PAGE_SIZE = 25;
const DEFAULT_DRIVER_PASSWORD = "driver@1";
const DEFAULT_ORG_STAFF_PASSWORD = "staff@1";
const DEFAULT_OWNER_PASSWORD = "owner@1";

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(s: string) {
  if (s === "ACTIVE" || s === "IN_PROGRESS") return "var(--green-dark)";
  if (s === "COMPLETED") return "var(--text-muted)";
  return "var(--red)";
}

function PagerRow({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className={styles.paginationRow}>
      <button className={styles.secondaryButton} disabled={page <= 1} onClick={onPrev}>
        Previous
      </button>
      <span className={styles.paginationInfo}>
        Page {page} of {totalPages} ({total} total)
      </span>
      <button className={styles.secondaryButton} disabled={page >= totalPages} onClick={onNext}>
        Next
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrgDashboard() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Data
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [owners, setOwners] = useState<CarOwner[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [routeTemplates, setRouteTemplates] = useState<RouteTemplate[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [violationPagination, setViolationPagination] = useState<Pagination | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);

  // Pagination state
  const [driverPage, setDriverPage] = useState(1);
  const [tripPage, setTripPage] = useState(1);
  const [violationPage, setViolationPage] = useState(1);

  // People section
  const [peopleTab, setPeopleTab] = useState<"drivers" | "owners">("drivers");
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);

  // Forms
  const [driverForm, setDriverForm] = useState({
    organizationId: "",
    fullName: "",
    email: "",
    phone: "",
    licenseNumber: "",
    nationalId: "",
    password: DEFAULT_DRIVER_PASSWORD,
  });
  const [ownerForm, setOwnerForm] = useState({
    organizationId: "",
    fullName: "",
    email: "",
    phone: "",
    address: "",
    password: DEFAULT_OWNER_PASSWORD,
  });
  const [vehicleForm, setVehicleForm] = useState({
    organizationId: "",
    carOwnerId: "",
    registrationNumber: "",
    vehicleType: "Trotro",
    make: "",
    model: "",
    color: "",
  });
  const [assignmentForm, setAssignmentForm] = useState({ driverId: "", vehicleId: "" });
  const [routeTemplateForm, setRouteTemplateForm] = useState({
    organizationId: "",
    name: "",
    origin: "",
    destination: "",
    estimatedDistanceKm: "",
    estimatedDurationMinutes: "",
    speedLimit: "",
  });
  const [orgUserForm, setOrgUserForm] = useState({
    organizationId: "",
    fullName: "",
    email: "",
    phone: "",
    password: DEFAULT_ORG_STAFF_PASSWORD,
    role: "ORG_OFFICER",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeOrganizationId, setActiveOrganizationId] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useAutoDismissMessage(notice, setNotice, NOTICE_TOAST_DISMISS_MS);
  useAutoDismissMessage(error, setError, ERROR_TOAST_DISMISS_MS);

  // Edit state — organisation
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [orgEditForm, setOrgEditForm] = useState({ name: "", contactPerson: "", phone: "", email: "", address: "", status: "" });

  // Edit state — driver
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [driverEditForm, setDriverEditForm] = useState({ fullName: "", email: "", phone: "", nationalId: "", licenseNumber: "" });

  // Edit state — car owner
  const [editingOwner, setEditingOwner] = useState<CarOwner | null>(null);
  const [ownerEditForm, setOwnerEditForm] = useState({ fullName: "", email: "", phone: "", address: "" });

  // Edit state — vehicle
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleEditForm, setVehicleEditForm] = useState({ vehicleType: "", make: "", model: "", color: "", status: "" });

  // Edit state — route template
  const [editingRoute, setEditingRoute] = useState<RouteTemplate | null>(null);
  const [routeEditForm, setRouteEditForm] = useState({ name: "", origin: "", destination: "", estimatedDistanceKm: "", estimatedDurationMinutes: "", speedLimit: "", status: "" });

  // Change password state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changePasswordForm, setChangePasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  // Fleet wizard
  const [fleetWizardStep, setFleetWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardNewOwner, setWizardNewOwner] = useState(false);
  const [wizardCreatedVehicleId, setWizardCreatedVehicleId] = useState<string | null>(null);

  // Fleet section
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [fleetView, setFleetView] = useState<"vehicles" | "assignments">("vehicles");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const selectedOrganizationId = activeOrganizationId || orgs[0]?.id || "";

  // ── API helpers ─────────────────────────────────────────────────────────────

  const loadViolations = async (
    activeToken = token,
    page = 1,
    severity = severityFilter,
    organizationId = activeOrganizationId,
  ) => {
    if (!activeToken) return;
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (severity) params.set("severity", severity);
    if (organizationId) params.set("organizationId", organizationId);
    const res = await fetch(
      `${API_BASE}/violations?${params}`,
      { headers: { Authorization: `Bearer ${activeToken}` } },
    ).then((r) => r.json());
    setViolations(res.data ?? []);
    setViolationPagination(res.pagination ?? null);
  };

  const loadData = async (activeToken = token) => {
    if (!activeToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const [orgRes, drvRes, ownRes, vehRes, asnRes, routeRes, trpRes, alrtRes] = await Promise.all([
        apiRequest<Organization[]>("/organizations", activeToken),
        apiRequest<Driver[]>("/drivers", activeToken),
        apiRequest<CarOwner[]>("/car-owners", activeToken),
        apiRequest<Vehicle[]>("/vehicles", activeToken),
        apiRequest<Assignment[]>("/assignments", activeToken),
        apiRequest<RouteTemplate[]>("/route-templates?includeInactive=true", activeToken),
        apiRequest<Trip[]>("/trips", activeToken),
        apiRequest<DashboardAlert[]>("/alerts", activeToken),
      ]);
      setOrgs(orgRes);
      setActiveOrganizationId((current) => current || orgRes[0]?.id || "");
      setDrivers(drvRes);
      setOwners(ownRes);
      setVehicles(vehRes);
      setAssignments(asnRes);
      setRouteTemplates(routeRes);
      setTrips(trpRes);
      setAlerts(alrtRes);
      await loadViolations(activeToken, 1, severityFilter, activeOrganizationId || orgRes[0]?.id || "");
      // Load org users for the primary org
      try {
        const orgUsersRes = await apiRequest<OrgUser[]>("/organizations/users", activeToken);
        setOrgUsers(orgUsersRes);
      } catch { /* non-critical — endpoint may not exist yet */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Auth ─────────────────────────────────────────────────────────────────────

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await apiLogin(identifier, password);
      const allowed = ["ORG_ADMIN", "ORG_OFFICER", "SUPER_ADMIN", "STAFF"];
      if (!allowed.includes(result.user.role)) {
        setError("This portal is for organisation administrators.");
        return;
      }
      setToken(result.token);
      setUser(result.user);
      localStorage.setItem("smartrans_org_token", result.token);
      localStorage.setItem("smartrans_org_user", JSON.stringify(result.user));
      await loadData(result.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("smartrans_org_token");
    localStorage.removeItem("smartrans_org_user");
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest("/auth/change-password", token, {
        method: "POST",
        body: JSON.stringify({
          currentPassword: changePasswordForm.currentPassword,
          newPassword: changePasswordForm.newPassword,
        }),
      });
      setShowChangePassword(false);
      setChangePasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setNotice("Password changed. You will be signed out.");
      setTimeout(() => handleLogout(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem("smartrans_org_token");
    const storedUser = localStorage.getItem("smartrans_org_user");
    if (stored && storedUser) {
      const u = JSON.parse(storedUser) as DashboardUser;
      if (["ORG_ADMIN", "ORG_OFFICER", "SUPER_ADMIN", "STAFF"].includes(u.role)) {
        setToken(stored);
        setUser(u);
        void loadData(stored);
      }
    }
  }, []);

  // ── Org user actions ─────────────────────────────────────────────────────────

  const isOrgAdmin = user?.role === "ORG_ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "STAFF";
  const selectedOrgUserOrganizationId = orgUserForm.organizationId || selectedOrganizationId || "";

  const handleCreateOrgUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest("/organizations/users", token, {
        method: "POST",
        body: JSON.stringify({
          ...orgUserForm,
          email: orgUserForm.email || undefined,
          phone: orgUserForm.phone || undefined,
          password: orgUserForm.password || undefined,
          organizationId: selectedOrgUserOrganizationId,
        }),
      });
      setOrgUserForm((current) => ({
        organizationId: current.organizationId,
        fullName: "",
        email: "",
        phone: "",
        password: DEFAULT_ORG_STAFF_PASSWORD,
        role: "ORG_OFFICER",
      }));
      setNotice("Organisation user added.");
      const orgUsersRes = await apiRequest<OrgUser[]>("/organizations/users", token);
      setOrgUsers(orgUsersRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add user.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Alert read ───────────────────────────────────────────────────────────────

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

  // ── Driver actions ────────────────────────────────────────────────────────────

  const handleRegisterDriver = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest("/drivers", token, {
        method: "POST",
        body: JSON.stringify({
          ...driverForm,
          email: driverForm.email || undefined,
          phone: driverForm.phone || undefined,
          password: driverForm.password || undefined,
          nationalId: driverForm.nationalId || undefined,
          organizationId: driverForm.organizationId || selectedOrganizationId || orgs[0]?.id,
        }),
      });
      setDriverForm({
        organizationId: driverForm.organizationId,
        fullName: "",
        email: "",
        phone: "",
        licenseNumber: "",
        nationalId: "",
        password: DEFAULT_DRIVER_PASSWORD,
      });
      await loadData(token);
      setNotice("Driver registered.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register driver.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateOwner = async (e: FormEvent, advanceWizard = false) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await apiRequest<{ id: string }>("/car-owners", token, {
        method: "POST",
        body: JSON.stringify({
          organizationId: ownerForm.organizationId || activeOrganizationId || orgs[0]?.id || undefined,
          fullName: ownerForm.fullName,
          email: ownerForm.email || undefined,
          phone: ownerForm.phone || undefined,
          address: ownerForm.address || undefined,
          password: ownerForm.password || undefined,
        }),
      });
      await loadData(token);
      if (advanceWizard) {
        setVehicleForm((prev) => ({
          ...prev,
          organizationId: ownerForm.organizationId || activeOrganizationId || orgs[0]?.id || "",
          carOwnerId: created.id,
        }));
        setFleetWizardStep(2);
      } else {
        setOwnerForm({
          organizationId: ownerForm.organizationId,
          fullName: "",
          email: "",
          phone: "",
          address: "",
          password: DEFAULT_OWNER_PASSWORD,
        });
        setNotice("Vehicle owner created.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create owner.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (account: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
  }) => {
    if (!token) return;
    const identifier = account.email ?? account.phone;
    if (!identifier) {
      setError("This account needs an email or phone before password reset.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ identifier }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message ?? "Failed to reset password.");
      }
      setNotice(`${account.fullName} password reset to ${body.temporaryPassword ?? "the default password"}.`);
      await loadData(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleDriverStatus = async (driver: Driver) => {
    if (!token) return;
    const newStatus = driver.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await apiRequest(`/drivers/${driver.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      await loadData(token);
      setNotice(`Driver ${newStatus === "ACTIVE" ? "activated" : "deactivated"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update driver.");
    }
  };

  const handleToggleConsent = async (driver: Driver) => {
    if (!token) return;
    try {
      await apiRequest(`/drivers/${driver.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ consentGiven: !driver.consentGiven }),
      });
      await loadData(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update consent.");
    }
  };

  // ── Edit handlers ─────────────────────────────────────────────────────────────

  const openEditOrg = (org: Organization) => {
    setEditingOrg(org);
    setOrgEditForm({
      name: org.name,
      contactPerson: "",
      phone: org.phone ?? "",
      email: org.email ?? "",
      address: org.address ?? "",
      status: org.status,
    });
  };

  const handleUpdateOrg = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !editingOrg) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/organizations/${editingOrg.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          name: orgEditForm.name || undefined,
          contactPerson: orgEditForm.contactPerson || undefined,
          phone: orgEditForm.phone || undefined,
          email: orgEditForm.email || undefined,
          address: orgEditForm.address || undefined,
          status: orgEditForm.status || undefined,
        }),
      });
      setEditingOrg(null);
      await loadData(token);
      setNotice("Organisation updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update organisation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDriver = (driver: Driver) => {
    setEditingDriver(driver);
    setDriverEditForm({
      fullName: driver.user.fullName,
      email: driver.user.email ?? "",
      phone: driver.user.phone ?? "",
      nationalId: "",
      licenseNumber: driver.licenseNumber,
    });
  };

  const handleUpdateDriver = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !editingDriver) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/drivers/${editingDriver.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: driverEditForm.fullName || undefined,
          email: driverEditForm.email || undefined,
          phone: driverEditForm.phone || undefined,
          nationalId: driverEditForm.nationalId || undefined,
        }),
      });
      setEditingDriver(null);
      await loadData(token);
      setNotice("Driver updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update driver.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditOwner = (owner: CarOwner) => {
    setEditingOwner(owner);
    setOwnerEditForm({
      fullName: owner.user.fullName,
      email: owner.user.email ?? "",
      phone: owner.user.phone ?? "",
      address: owner.address ?? "",
    });
  };

  const handleUpdateOwner = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !editingOwner) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/car-owners/${editingOwner.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: ownerEditForm.fullName || undefined,
          email: ownerEditForm.email || undefined,
          phone: ownerEditForm.phone || undefined,
          address: ownerEditForm.address || undefined,
        }),
      });
      setEditingOwner(null);
      await loadData(token);
      setNotice("Owner updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update owner.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditVehicle = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setVehicleEditForm({
      vehicleType: vehicle.vehicleType,
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      color: vehicle.color ?? "",
      status: vehicle.status,
    });
  };

  const handleUpdateVehicle = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !editingVehicle) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/vehicles/${editingVehicle.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          vehicleType: vehicleEditForm.vehicleType || undefined,
          make: vehicleEditForm.make || undefined,
          model: vehicleEditForm.model || undefined,
          color: vehicleEditForm.color || undefined,
          status: vehicleEditForm.status || undefined,
        }),
      });
      setEditingVehicle(null);
      setSelectedVehicle(null);
      await loadData(token);
      setNotice("Vehicle updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update vehicle.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditRoute = (route: RouteTemplate) => {
    setEditingRoute(route);
    setRouteEditForm({
      name: route.name,
      origin: route.origin,
      destination: route.destination,
      estimatedDistanceKm: route.estimatedDistanceKm ? String(route.estimatedDistanceKm) : "",
      estimatedDurationMinutes: route.estimatedDurationMinutes ? String(route.estimatedDurationMinutes) : "",
      speedLimit: route.speedLimit ? String(route.speedLimit) : "",
      status: route.status,
    });
  };

  const handleUpdateRoute = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !editingRoute) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/route-templates/${editingRoute.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          name: routeEditForm.name || undefined,
          origin: routeEditForm.origin || undefined,
          destination: routeEditForm.destination || undefined,
          estimatedDistanceKm: routeEditForm.estimatedDistanceKm ? Number(routeEditForm.estimatedDistanceKm) : undefined,
          estimatedDurationMinutes: routeEditForm.estimatedDurationMinutes ? Number(routeEditForm.estimatedDurationMinutes) : undefined,
          speedLimit: routeEditForm.speedLimit ? Number(routeEditForm.speedLimit) : undefined,
          status: (routeEditForm.status as "ACTIVE" | "INACTIVE") || undefined,
        }),
      });
      setEditingRoute(null);
      await loadData(token);
      setNotice("Route updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update route.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Vehicle actions ───────────────────────────────────────────────────────────

  const handleRegisterVehicle = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await apiRequest<{ id: string }>("/vehicles", token, {
        method: "POST",
        body: JSON.stringify({
          ...vehicleForm,
          organizationId: vehicleForm.organizationId || selectedOrganizationId || orgs[0]?.id,
          make: vehicleForm.make || undefined,
          model: vehicleForm.model || undefined,
          color: vehicleForm.color || undefined,
        }),
      });
      setWizardCreatedVehicleId(created.id);
      setAssignmentForm((prev) => ({ ...prev, vehicleId: created.id }));
      await loadData(token);
      setFleetWizardStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register vehicle.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Assignment actions ────────────────────────────────────────────────────────

  const handleAssignDriver = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest("/assignments", token, {
        method: "POST",
        body: JSON.stringify(assignmentForm),
      });
      setAssignmentForm({ driverId: "", vehicleId: "" });
      await loadData(token);
      setNotice("Vehicle registered and driver assigned.");
      resetWizard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create assignment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetWizard = () => {
    setFleetWizardStep(1);
    setWizardNewOwner(false);
    setWizardCreatedVehicleId(null);
    setOwnerForm({ organizationId: "", fullName: "", email: "", phone: "", address: "", password: DEFAULT_OWNER_PASSWORD });
    setVehicleForm({ organizationId: "", carOwnerId: "", registrationNumber: "", vehicleType: "Trotro", make: "", model: "", color: "" });
    setAssignmentForm({ driverId: "", vehicleId: "" });
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!token) return;
    try {
      await apiRequest(`/assignments/${assignmentId}`, token, { method: "DELETE" });
      await loadData(token);
      setNotice("Assignment removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove assignment.");
    }
  };

  const handleCreateRouteTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest("/route-templates", token, {
        method: "POST",
        body: JSON.stringify({
          organizationId: routeTemplateForm.organizationId || selectedOrganizationId || orgs[0]?.id,
          name: routeTemplateForm.name,
          origin: routeTemplateForm.origin,
          destination: routeTemplateForm.destination,
          estimatedDistanceKm: routeTemplateForm.estimatedDistanceKm
            ? Number(routeTemplateForm.estimatedDistanceKm)
            : undefined,
          estimatedDurationMinutes: routeTemplateForm.estimatedDurationMinutes
            ? Number(routeTemplateForm.estimatedDurationMinutes)
            : undefined,
          speedLimit: routeTemplateForm.speedLimit ? Number(routeTemplateForm.speedLimit) : undefined,
        }),
      });
      setRouteTemplateForm((current) => ({
        organizationId: current.organizationId || selectedOrganizationId || orgs[0]?.id || "",
        name: "",
        origin: "",
        destination: "",
        estimatedDistanceKm: "",
        estimatedDurationMinutes: "",
        speedLimit: "",
      }));
      await loadData(token);
      setNotice("Route template created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create route template.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRouteTemplateStatus = async (routeTemplate: RouteTemplate) => {
    if (!token) return;
    try {
      await apiRequest(`/route-templates/${routeTemplate.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: routeTemplate.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
      });
      await loadData(token);
      setNotice("Route template status updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update route template.");
    }
  };

  const handleCancelTrip = async (tripId: string) => {
    if (!token) return;
    try {
      await apiRequest(`/trips/${tripId}/cancel`, token, { method: "PATCH" });
      await loadData(token);
      setNotice("Trip cancelled.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel trip.");
    }
  };

  const handleUpdateDeliveryStatus = async (alertId: string, deliveryStatus: string) => {
    if (!token) return;
    try {
      await apiRequest(`/alerts/${alertId}/delivery-status`, token, {
        method: "PATCH",
        body: JSON.stringify({ deliveryStatus }),
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, deliveryStatus } : a)),
      );
      setNotice("Delivery status updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update delivery status.");
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────────

  const q = search.toLowerCase();
  const primaryOrg = orgs.find((org) => org.id === selectedOrganizationId) ?? orgs[0];
  const ownerBelongsToSelectedOrganization = (owner: CarOwner) => {
    if (!selectedOrganizationId) return true;

    const hasMembership = owner.user.organizationUsers?.some(
      (membership) => membership.organization.id === selectedOrganizationId,
    );
    const hasVehicle = owner.vehicles?.some((vehicle) => vehicle.organizationId === selectedOrganizationId);

    return Boolean(hasMembership || hasVehicle);
  };
  const ownerOrganizationNames = (owner: CarOwner): string[] =>
    Array.from(
      new Set([
        ...(owner.vehicles?.flatMap((vehicle) => (vehicle.organization?.name ? [vehicle.organization.name] : [])) ?? []),
        ...(owner.user.organizationUsers?.map((membership) => membership.organization.name) ?? []),
      ]),
    );
  const scopedDrivers = selectedOrganizationId
    ? drivers.filter((driver) => driver.organization.id === selectedOrganizationId)
    : drivers;
  const scopedOwners = selectedOrganizationId ? owners.filter(ownerBelongsToSelectedOrganization) : owners;
  const scopedVehicles = selectedOrganizationId
    ? vehicles.filter((vehicle) => vehicle.organization?.id === selectedOrganizationId)
    : vehicles;
  const scopedAssignments = selectedOrganizationId
    ? assignments.filter(
        (assignment) =>
          assignment.driver.organization.id === selectedOrganizationId ||
          assignment.vehicle.organization?.id === selectedOrganizationId,
      )
    : assignments;
  const activeScopedAssignments = scopedAssignments.filter((assignment) => assignment.isActive);
  const scopedRouteTemplates = selectedOrganizationId
    ? routeTemplates.filter((routeTemplate) => routeTemplate.organizationId === selectedOrganizationId)
    : routeTemplates;
  const scopedTrips = selectedOrganizationId
    ? trips.filter(
        (trip) =>
          trip.organization?.id === selectedOrganizationId ||
          trip.driver?.organization.id === selectedOrganizationId,
      )
    : trips;
  const scopedViolations = selectedOrganizationId
    ? violations.filter(
        (violation) =>
          violation.organization?.id === selectedOrganizationId ||
          violation.driver?.organization.id === selectedOrganizationId,
      )
    : violations;

  const filteredDrivers = scopedDrivers.filter(
    (d) =>
      d.user.fullName.toLowerCase().includes(q) ||
      d.licenseNumber.toLowerCase().includes(q) ||
      d.organization.name.toLowerCase().includes(q),
  );
  const filteredTrips = scopedTrips.filter(
    (t) =>
      ((t.driver?.user.fullName ?? "").toLowerCase().includes(q) ||
        (t.vehicle?.registrationNumber ?? "").toLowerCase().includes(q) ||
        (t.routeTemplate?.name ?? "").toLowerCase().includes(q) ||
        (t.routeTemplate?.origin ?? "").toLowerCase().includes(q) ||
        (t.routeTemplate?.destination ?? "").toLowerCase().includes(q)) &&
      (statusFilter ? t.status === statusFilter : true),
  );
  const filteredRouteTemplates = scopedRouteTemplates.filter(
    (routeTemplate) =>
      routeTemplate.name.toLowerCase().includes(q) ||
      routeTemplate.origin.toLowerCase().includes(q) ||
      routeTemplate.destination.toLowerCase().includes(q) ||
      routeTemplate.status.toLowerCase().includes(q),
  );

  const pagedDrivers = filteredDrivers.slice((driverPage - 1) * PAGE_SIZE, driverPage * PAGE_SIZE);
  const pagedTrips = filteredTrips.slice((tripPage - 1) * PAGE_SIZE, tripPage * PAGE_SIZE);
  const unreadCount = alerts.filter((a) => !a.isRead).length;

  // ── Metrics ──────────────────────────────────────────────────────────────────

  const activeTrips = scopedTrips.filter((t) => t.status === "IN_PROGRESS").length;
  const criticalViolations = scopedViolations.filter((v) => v.severity === "CRITICAL").length;

  const navItems: Array<{ id: Section; label: string; icon: string }> = [
    { id: "overview", label: "Overview", icon: "⊡" },
    ...(isOrgAdmin ? [{ id: "users" as Section, label: "Organisation Users", icon: "⋯" }] : []),
    { id: "people", label: "Drivers & Owners", icon: "◫" },
    { id: "routes", label: "Route Templates", icon: "↔" },
    { id: "fleet", label: "Fleet", icon: "▣" },
    { id: "trips", label: "Trips", icon: "⌁" },
    { id: "violations", label: "Violations", icon: "!" },
    { id: "alerts", label: `Alerts${unreadCount > 0 ? ` (${unreadCount})` : ""}`, icon: "◦" },
  ];

  const shellClassName = [
    styles.shell,
    sidebarCollapsed ? styles.shellCollapsed : "",
    sidebarOpen ? styles.shellNavOpen : "",
  ].filter(Boolean).join(" ");

  // ── Login screen ─────────────────────────────────────────────────────────────

  if (!token) {
    return (
      <main className={styles.main}>
        <div className={styles.loginCard}>
          <div className={styles.loginCardLogo}>
            <div className={styles.loginCardMark}>ST</div>
            <div>
              <p className={styles.loginTitle}>SmarTrans</p>
              <p className={styles.loginSubtitle}>Organisation portal</p>
            </div>
          </div>
          {error && <p className={styles.errorBanner}>{error}</p>}
          <form onSubmit={handleLogin} className={styles.loginForm}>
            <input
              className={styles.input}
              placeholder="Email or phone"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
            <input
              className={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className={styles.primaryButton} type="submit">
              Sign in
            </button>
          </form>
        </div>
      </main>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  return (
    <div className={shellClassName}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <span className={styles.brandMark}>ST</span>
          <div>
            <p className={styles.brandName}>{primaryOrg?.name ?? "SmarTrans"}</p>
            <p className={styles.brandRole}>{humanize(user?.role ?? "")}</p>
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
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <p className={styles.footerUser}>{user?.fullName}</p>
          <p className={styles.footerRole}>{humanize(user?.role ?? "")}</p>
          <button className={styles.secondaryButton} style={{ marginBottom: 6 }} onClick={() => setShowChangePassword(true)}>
            Change password
          </button>
          <button className={styles.logoutButton} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <button
        type="button"
        className={styles.sidebarBackdrop}
        onClick={() => setSidebarOpen(false)}
        aria-label="Close navigation"
      />

      {/* Main content */}
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
          <span>{primaryOrg?.name ?? "Organisation"}</span>
        </div>

        {notice && <div className={styles.noticeBanner} onClick={() => setNotice(null)}>{notice}</div>}
        {error && <div className={styles.errorBanner} onClick={() => setError(null)}>{error}</div>}

        {orgs.length > 1 && (
          <div className={styles.sectionHeader} style={{ marginBottom: 20 }}>
            <div>
              <p className={styles.eyebrow}>Organisation scope</p>
              <h2 className={styles.sectionTitle}>{primaryOrg?.name ?? "Organisation"}</h2>
            </div>
            <label className={styles.scopeLabel}>
              Organisation
              <select
                className={styles.fieldInput}
                value={selectedOrganizationId}
                onChange={(e) => {
                  const organizationId = e.target.value;
                  setActiveOrganizationId(organizationId);
                  setDriverPage(1);
                  setTripPage(1);
                  setViolationPage(1);
                  setSelectedDriver(null);
                  setDriverForm((current) => ({ ...current, organizationId }));
                  setOwnerForm((current) => ({ ...current, organizationId }));
                  setVehicleForm((current) => ({ ...current, organizationId, carOwnerId: "" }));
                  setRouteTemplateForm((current) => ({ ...current, organizationId }));
                  void loadViolations(token, 1, severityFilter, organizationId);
                }}
              >
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {activeSection === "overview" && (
          <section className={styles.sectionGrid}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                {primaryOrg?.name ?? "Organisation"} overview
              </h2>
              <div style={{ display: "flex", gap: 8 }}>
                {isOrgAdmin && primaryOrg && (
                  <button
                    className={styles.secondaryButton}
                    onClick={() => openEditOrg(primaryOrg)}
                  >
                    Edit details
                  </button>
                )}
                <button
                  className={styles.secondaryButton}
                  onClick={() => loadData(token)}
                >
                  {isLoading ? "Loading…" : "Refresh"}
                </button>
              </div>
            </div>

            {/* Metric cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
              {[
                { label: "Drivers", value: scopedDrivers.length, color: "#1f7a4b" },
                { label: "Vehicles", value: scopedVehicles.length, color: "#1f7a4b" },
                { label: "Active trips", value: activeTrips, color: activeTrips > 0 ? "var(--amber)" : "var(--text-muted)" },
                { label: "Violations", value: scopedViolations.length, color: "var(--red)" },
                { label: "Critical", value: criticalViolations, color: criticalViolations > 0 ? "var(--red)" : "var(--text-muted)" },
                { label: "Unread alerts", value: unreadCount, color: unreadCount > 0 ? "var(--red)" : "var(--text-muted)" },
              ].map((m) => (
                <div key={m.label} className={styles.metricCard} style={{ border: "1px solid #dbe5df", borderRadius: 8, padding: 18 }}>
                  <span style={{ color: "#5c6d64", fontSize: 13, fontWeight: 700 }}>{m.label}</span>
                  <strong style={{ fontSize: 32, color: m.color }}>{m.value}</strong>
                </div>
              ))}
            </div>

            {/* Active trips */}
            {activeTrips > 0 && (
              <div>
                <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Active trips</h3>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Driver</th>
                        <th>Vehicle</th>
                        <th>Route</th>
                        <th>Started</th>
                        <th>Locations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scopedTrips.filter((t) => t.status === "IN_PROGRESS").map((t) => (
                        <tr key={t.id}>
                          <td>{t.driver?.user.fullName ?? "—"}</td>
                          <td>{t.vehicle?.registrationNumber ?? "—"}</td>
                          <td>{t.routeTemplate?.name ?? "—"}</td>
                          <td>{formatDate(t.startTime)}</td>
                          <td>{t._count?.locations ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Organisation Users ───────────────────────────────────────────── */}
        {activeSection === "users" && isOrgAdmin && (
          <section className={styles.sectionGrid}>
            <div className={styles.twoColumn}>
              {/* Add org user form */}
              <form className={styles.formPanel} onSubmit={handleCreateOrgUser}>
                <div>
                  <p className={styles.eyebrow}>Organisation action</p>
                  <h2>Add organisation user</h2>
                </div>
                <div className={styles.formGrid}>
                  <label>
                    <span>Organisation</span>
                    <select
                      required
                      value={selectedOrgUserOrganizationId}
                      onChange={(e) => setOrgUserForm({ ...orgUserForm, organizationId: e.target.value })}
                    >
                      <option value="">Select organisation…</option>
                      {orgs.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Full name</span>
                    <input
                      required
                      value={orgUserForm.fullName}
                      onChange={(e) => setOrgUserForm({ ...orgUserForm, fullName: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Role</span>
                    <select
                      value={orgUserForm.role}
                      onChange={(e) => setOrgUserForm({ ...orgUserForm, role: e.target.value })}
                    >
                      <option value="ORG_OFFICER">Officer</option>
                      <option value="ORG_ADMIN">Admin</option>
                    </select>
                  </label>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={orgUserForm.email}
                      onChange={(e) => setOrgUserForm({ ...orgUserForm, email: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input
                      value={orgUserForm.phone}
                      onChange={(e) => setOrgUserForm({ ...orgUserForm, phone: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Password</span>
                    <input
                      type="password"
                      placeholder={DEFAULT_ORG_STAFF_PASSWORD}
                      value={orgUserForm.password}
                      onChange={(e) => setOrgUserForm({ ...orgUserForm, password: e.target.value })}
                    />
                  </label>
                </div>
                <button className={styles.primaryButton} disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Adding…" : "Add user"}
                </button>
              </form>

              {/* Org users table */}
              <div className={styles.tablePanel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.eyebrow}>Organisation</p>
                    <h2>Team members</h2>
                  </div>
                  <span className={styles.statusPill}>{orgUsers.length} users</span>
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Organisation</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgUsers.length === 0 && (
                        <tr><td colSpan={7}>No users found for this organisation.</td></tr>
                      )}
                      {orgUsers.map((ou) => (
                        <tr key={ou.id}>
                          <td style={{ fontWeight: 700 }}>{ou.user.fullName}</td>
                          <td>{ou.user.email ?? "—"}</td>
                          <td>{ou.user.phone ?? "—"}</td>
                          <td>{ou.organization?.name ?? primaryOrg?.name ?? "—"}</td>
                          <td>{humanize(ou.role)}</td>
                          <td>
                            <span className={styles.statusPill}>{humanize(ou.status)}</span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              style={{ minHeight: 30, fontSize: 12 }}
                              disabled={isSubmitting}
                              onClick={() => handleResetPassword(ou.user)}
                            >
                              Reset password
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── People ───────────────────────────────────────────────────────── */}
        {activeSection === "people" && (
          <section style={{ position: "relative" }}>

            {/* Tab bar */}
            <div className={styles.peopleTabBar}>
              {(["drivers", "owners"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={peopleTab === tab ? styles.peopleTabActive : styles.peopleTab}
                  onClick={() => { setPeopleTab(tab); setSelectedDriver(null); }}
                >
                  {tab === "drivers" ? `Drivers (${scopedDrivers.length})` : `Owners (${scopedOwners.length})`}
                </button>
              ))}
            </div>

            {/* ── Drivers tab ── */}
            {peopleTab === "drivers" && (
              <div className={styles.peopleLayout}>
                {/* Left: register form */}
                <div className={styles.peopleForm}>
                  <p className={styles.eyebrow}>Register</p>
                  <h3 className={styles.peopleFormTitle}>New driver</h3>
                  <form onSubmit={handleRegisterDriver} style={{ display: "grid", gap: 12, marginTop: 16 }}>
                    {orgs.length > 1 && (
                      <label className={styles.fieldLabel}>
                        Organisation
                        <select
                          className={styles.fieldInput}
                          value={driverForm.organizationId || selectedOrganizationId}
                          onChange={(e) => setDriverForm({ ...driverForm, organizationId: e.target.value })}
                        >
                          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </label>
                    )}
                    {[
                      { key: "fullName",      label: "Full name",       placeholder: "Kwame Mensah",      required: true  },
                      { key: "licenseNumber", label: "Licence number",  placeholder: "GH-DL-000000",     required: true  },
                      { key: "phone",         label: "Phone",           placeholder: "+233 20 000 0000",  required: false },
                      { key: "email",         label: "Email",           placeholder: "kwame@example.com", required: false },
                      { key: "nationalId",    label: "National ID",     placeholder: "GHA-000000000-0",   required: false },
                      { key: "password",      label: "Initial password",placeholder: DEFAULT_DRIVER_PASSWORD, required: false },
                    ].map(({ key, label, placeholder, required }) => (
                      <label key={key} className={styles.fieldLabel}>
                        {label}
                        <input
                          className={styles.fieldInput}
                          placeholder={placeholder}
                          required={required}
                          type={key === "password" ? "password" : "text"}
                          value={(driverForm as Record<string, string>)[key]}
                          onChange={(e) => setDriverForm({ ...driverForm, [key]: e.target.value })}
                        />
                      </label>
                    ))}
                    <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Registering…" : "Register driver"}
                    </button>
                  </form>
                </div>

                {/* Right: cards + profile drawer */}
                <div className={styles.peopleCards}>
                  <div className={styles.peopleCardsHeader}>
                    <input
                      className={styles.filterInput}
                      placeholder="Search drivers…"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setDriverPage(1); }}
                      style={{ flex: 1 }}
                    />
                  </div>

                  <div className={styles.driverGrid}>
                    {pagedDrivers.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={`${styles.driverCard} ${selectedDriver?.id === d.id ? styles.driverCardActive : ""}`}
                        onClick={() => setSelectedDriver(selectedDriver?.id === d.id ? null : d)}
                      >
                        <div className={styles.driverCardAvatar}>
                          {d.user.fullName[0].toUpperCase()}
                        </div>
                        <div className={styles.driverCardBody}>
                          <span className={styles.driverCardName}>{d.user.fullName}</span>
                          <span className={styles.driverCardMeta}>{d.licenseNumber}</span>
                          <span className={styles.driverCardMeta}>{d.organization.name}</span>
                        </div>
                        <div className={styles.driverCardBadges}>
                          <span className={d.status === "ACTIVE" ? styles.chipGreen : styles.chipRed}>
                            {humanize(d.status)}
                          </span>
                          <span className={d.consentGiven ? styles.chipGreen : styles.chipAmber}>
                            {d.consentGiven ? "Consent ✓" : "No consent"}
                          </span>
                        </div>
                      </button>
                    ))}
                    {pagedDrivers.length === 0 && (
                      <p className={styles.emptyState}>No drivers found.</p>
                    )}
                  </div>

                  <PagerRow
                    page={driverPage}
                    totalPages={Math.ceil(filteredDrivers.length / PAGE_SIZE)}
                    total={filteredDrivers.length}
                    onPrev={() => setDriverPage((p) => p - 1)}
                    onNext={() => setDriverPage((p) => p + 1)}
                  />
                </div>

                {/* Profile drawer */}
                {selectedDriver && (
                  <div className={styles.profileDrawer}>
                    <div className={styles.profileDrawerHeader}>
                      <div className={styles.profileAvatar}>
                        {selectedDriver.user.fullName[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className={styles.profileName}>{selectedDriver.user.fullName}</p>
                        <p className={styles.profileOrg}>{selectedDriver.organization.name}</p>
                      </div>
                      <button
                        type="button"
                        className={styles.drawerClose}
                        onClick={() => setSelectedDriver(null)}
                        aria-label="Close profile"
                      >
                        ✕
                      </button>
                    </div>

                    <div className={styles.profileStats}>
                      {[
                        { label: "Status",  value: humanize(selectedDriver.status),    accent: selectedDriver.status === "ACTIVE" ? "green" : "red" },
                        { label: "Consent", value: selectedDriver.consentGiven ? "Given" : "Pending", accent: selectedDriver.consentGiven ? "green" : "amber" },
                        { label: "Trips",   value: String(scopedTrips.filter((t) => t.driver?.id === selectedDriver.id).length) },
                        { label: "Violations", value: String(scopedViolations.filter((v) => v.driver?.id === selectedDriver.id).length) },
                      ].map((s) => (
                        <div key={s.label} className={styles.profileStat}>
                          <span className={styles.profileStatLabel}>{s.label}</span>
                          <span
                            className={styles.profileStatValue}
                            style={{
                              color: s.accent === "green" ? "var(--green-dark)"
                                   : s.accent === "red"   ? "var(--red)"
                                   : s.accent === "amber" ? "#b45309"
                                   : "var(--text-dark)",
                            }}
                          >
                            {s.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className={styles.profileFields}>
                      {[
                        { label: "Licence",     value: selectedDriver.licenseNumber },
                        { label: "National ID", value: selectedDriver.user.id },
                        { label: "Email",       value: selectedDriver.user.email ?? "—" },
                        { label: "Phone",       value: selectedDriver.user.phone ?? "—" },
                      ].map(({ label, value }) => (
                        <div key={label} className={styles.profileField}>
                          <span className={styles.profileFieldLabel}>{label}</span>
                          <span className={styles.profileFieldValue}>{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Recent trips */}
                    {(() => {
                      const driverTrips = scopedTrips.filter((t) => t.driver?.id === selectedDriver.id).slice(0, 4);
                      return driverTrips.length > 0 ? (
                        <div className={styles.profileSection}>
                          <p className={styles.profileSectionTitle}>Recent trips</p>
                          {driverTrips.map((t) => (
                            <div key={t.id} className={styles.profileTrip}>
                              <span style={{ fontWeight: 700, fontSize: 12 }}>{t.vehicle?.registrationNumber ?? "—"}</span>
                              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{humanize(t.status)}</span>
                              <span style={{ color: "var(--text-muted)", fontSize: 12, marginLeft: "auto" }}>{formatDate(t.startTime)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null;
                    })()}

                    <div className={styles.profileActions}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={isSubmitting}
                        onClick={() => openEditDriver(selectedDriver)}
                        style={{ gridColumn: "1/-1" }}
                      >
                        Edit details
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={isSubmitting}
                        onClick={() => handleToggleDriverStatus(selectedDriver)}
                      >
                        {selectedDriver.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={isSubmitting}
                        onClick={() => handleToggleConsent(selectedDriver)}
                      >
                        {selectedDriver.consentGiven ? "Revoke consent" : "Grant consent"}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={isSubmitting}
                        onClick={() => handleResetPassword(selectedDriver.user)}
                        style={{ gridColumn: "1/-1" }}
                      >
                        Reset password
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Owners tab ── */}
            {peopleTab === "owners" && (
              <div className={styles.peopleLayout}>
                {/* Left: register form */}
                <div className={styles.peopleForm}>
                  <p className={styles.eyebrow}>Register</p>
                  <h3 className={styles.peopleFormTitle}>New owner</h3>
                  <form onSubmit={(e) => handleCreateOwner(e, false)} style={{ display: "grid", gap: 12, marginTop: 16 }}>
                    {orgs.length > 1 && (
                      <label className={styles.fieldLabel}>
                        Organisation
                        <select
                          className={styles.fieldInput}
                          value={ownerForm.organizationId || selectedOrganizationId}
                          onChange={(e) => setOwnerForm({ ...ownerForm, organizationId: e.target.value })}
                        >
                          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </label>
                    )}
                    {[
                      { key: "fullName", label: "Full name",  placeholder: "Akosua Frimpong",       required: true  },
                      { key: "phone",    label: "Phone",      placeholder: "+233 24 000 0000",       required: false },
                      { key: "email",    label: "Email",      placeholder: "akosua@example.com",    required: false },
                      { key: "address",  label: "Address",    placeholder: "Tema, Greater Accra",   required: false },
                      { key: "password", label: "Password",   placeholder: DEFAULT_OWNER_PASSWORD, required: false },
                    ].map(({ key, label, placeholder, required }) => (
                      <label key={key} className={styles.fieldLabel}>
                        {label}
                        <input
                          className={styles.fieldInput}
                          placeholder={placeholder}
                          required={required}
                          type={key === "password" ? "password" : "text"}
                          value={(ownerForm as Record<string, string>)[key]}
                          onChange={(e) => setOwnerForm({ ...ownerForm, [key]: e.target.value })}
                        />
                      </label>
                    ))}
                    <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Creating…" : "Create owner"}
                    </button>
                  </form>
                </div>

                {/* Right: owner cards */}
                <div className={styles.peopleCards} style={{ gridColumn: "1 / -1" }}>
                  <div className={styles.ownerGrid}>
                    {scopedOwners.map((o) => (
                      <div key={o.id} className={styles.ownerCard}>
                        <div className={styles.ownerCardAvatar}>{o.user.fullName[0].toUpperCase()}</div>
                        <div className={styles.ownerCardBody}>
                          <p className={styles.ownerCardName}>{o.user.fullName}</p>
                          <p className={styles.ownerCardMeta}>{o.user.email ?? o.user.phone ?? "—"}</p>
                          <p className={styles.ownerCardMeta}>
                            {ownerOrganizationNames(o).join(", ") || primaryOrg?.name || "—"}
                          </p>
                          {o.address && <p className={styles.ownerCardMeta}>{o.address}</p>}
                        </div>
                        <div className={styles.ownerCardFooter}>
                          <span className={styles.chipGreen}>
                            {o.vehicles?.length ?? o._count?.vehicles ?? 0} vehicle{(o.vehicles?.length ?? o._count?.vehicles ?? 0) !== 1 ? "s" : ""}
                          </span>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              style={{ minHeight: 30, fontSize: 12, padding: "0 10px" }}
                              disabled={isSubmitting}
                              onClick={() => openEditOwner(o)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              style={{ minHeight: 30, fontSize: 12, padding: "0 10px" }}
                              disabled={isSubmitting}
                              onClick={() => handleResetPassword(o.user)}
                            >
                              Reset password
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {scopedOwners.length === 0 && <p className={styles.emptyState}>No owners registered.</p>}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Route Templates ─────────────────────────────────────────────── */}
        {activeSection === "routes" && (
          <section className={styles.sectionGrid}>
            <div className={styles.twoColumn}>
              <form className={styles.formPanel} onSubmit={handleCreateRouteTemplate}>
                <div>
                  <p className={styles.eyebrow}>Trip setup</p>
                  <h2>Add route template</h2>
                </div>
                <div className={styles.formGrid}>
                  {orgs.length > 1 && (
                    <label>
                      <span>Organisation</span>
                      <select
                        required
                        value={routeTemplateForm.organizationId || selectedOrganizationId}
                        onChange={(e) => setRouteTemplateForm({ ...routeTemplateForm, organizationId: e.target.value })}
                      >
                        {orgs.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    <span>Name</span>
                    <input
                      required
                      placeholder="Kumasi to Accra"
                      value={routeTemplateForm.name}
                      onChange={(e) => setRouteTemplateForm({ ...routeTemplateForm, name: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Origin</span>
                    <input
                      required
                      placeholder="Kumasi"
                      value={routeTemplateForm.origin}
                      onChange={(e) => setRouteTemplateForm({ ...routeTemplateForm, origin: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Destination</span>
                    <input
                      required
                      placeholder="Accra"
                      value={routeTemplateForm.destination}
                      onChange={(e) => setRouteTemplateForm({ ...routeTemplateForm, destination: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Distance km</span>
                    <input
                      min="1"
                      step="0.1"
                      type="number"
                      value={routeTemplateForm.estimatedDistanceKm}
                      onChange={(e) =>
                        setRouteTemplateForm({ ...routeTemplateForm, estimatedDistanceKm: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Duration minutes</span>
                    <input
                      min="1"
                      step="1"
                      type="number"
                      value={routeTemplateForm.estimatedDurationMinutes}
                      onChange={(e) =>
                        setRouteTemplateForm({ ...routeTemplateForm, estimatedDurationMinutes: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Speed limit</span>
                    <input
                      min="1"
                      step="1"
                      type="number"
                      placeholder={String(primaryOrg?.speedLimit ?? 80)}
                      value={routeTemplateForm.speedLimit}
                      onChange={(e) => setRouteTemplateForm({ ...routeTemplateForm, speedLimit: e.target.value })}
                    />
                  </label>
                </div>
                <button className={styles.primaryButton} disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Saving…" : "Create route"}
                </button>
              </form>

              <div className={styles.tablePanel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.eyebrow}>Route library</p>
                    <h2>Templates ({filteredRouteTemplates.length})</h2>
                  </div>
                  <input
                    className={styles.filterInput}
                    placeholder="Search routes…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Route</th>
                        <th>Origin</th>
                        <th>Destination</th>
                        <th>Limit</th>
                        <th>Trips</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRouteTemplates.map((routeTemplate) => (
                        <tr key={routeTemplate.id}>
                          <td style={{ fontWeight: 700 }}>{routeTemplate.name}</td>
                          <td>{routeTemplate.origin}</td>
                          <td>{routeTemplate.destination}</td>
                          <td>
                            {routeTemplate.speedLimit
                              ? `${Math.round(routeTemplate.speedLimit)} km/h`
                              : `${Math.round(primaryOrg?.speedLimit ?? 80)} km/h`}
                          </td>
                          <td>{routeTemplate._count?.trips ?? 0}</td>
                          <td>
                            <span className={styles.statusPill}>{humanize(routeTemplate.status)}</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={isSubmitting}
                                onClick={() => openEditRoute(routeTemplate)}
                                style={{ minHeight: 30, fontSize: 12 }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                disabled={isSubmitting}
                                onClick={() => handleToggleRouteTemplateStatus(routeTemplate)}
                                style={{ minHeight: 30, fontSize: 12 }}
                              >
                                {routeTemplate.status === "ACTIVE" ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredRouteTemplates.length === 0 && (
                        <tr><td colSpan={7} className={styles.emptyState}>No route templates found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Fleet ────────────────────────────────────────────────────────── */}
        {activeSection === "fleet" && (
          <section className={styles.sectionGrid}>

            {/* ── Wizard ── */}
            <div className={styles.wizardCard}>
              {/* Step bar */}
              <div className={styles.wizardStepBar}>
                {[
                  { n: 1, label: "Owner" },
                  { n: 2, label: "Vehicle" },
                  { n: 3, label: "Assign driver" },
                ].map(({ n, label }) => {
                  const done = fleetWizardStep > n;
                  const active = fleetWizardStep === n;
                  return (
                    <div
                      key={n}
                      className={`${styles.wizardStep} ${active ? styles.wizardStepActive : ""} ${done ? styles.wizardStepDone : ""}`}
                      onClick={() => { if (done) setFleetWizardStep(n as 1 | 2 | 3); }}
                    >
                      <span className={styles.wizardBadge}>
                        {done ? "✓" : n}
                      </span>
                      <span className={styles.wizardLabel}>{label}</span>
                    </div>
                  );
                })}
              </div>

              <div className={styles.wizardBody}>

                {/* ── Step 1: Owner ── */}
                {fleetWizardStep === 1 && (
                  <div style={{ display: "grid", gap: 20 }}>
                    <div>
                      <h3 className={styles.wizardTitle}>Step 1 — Vehicle owner</h3>
                      <p className={styles.wizardSub}>Select an existing owner or create a new one.</p>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        className={!wizardNewOwner ? styles.primaryButton : styles.secondaryButton}
                        style={{ minHeight: 36 }}
                        onClick={() => setWizardNewOwner(false)}
                      >
                        Select existing
                      </button>
                      <button
                        type="button"
                        className={wizardNewOwner ? styles.primaryButton : styles.secondaryButton}
                        style={{ minHeight: 36 }}
                        onClick={() => setWizardNewOwner(true)}
                      >
                        Create new owner
                      </button>
                    </div>

                    {!wizardNewOwner ? (
                      <div style={{ display: "grid", gap: 14 }}>
                        <label className={styles.fieldLabel}>
                          Choose owner
                          <select
                            className={styles.fieldInput}
                            value={vehicleForm.carOwnerId}
                            onChange={(e) => setVehicleForm({ ...vehicleForm, carOwnerId: e.target.value })}
                          >
                            <option value="">Select owner…</option>
                            {scopedOwners.map((o) => (
                              <option key={o.id} value={o.id}>{o.user.fullName}{o.user.phone ? ` · ${o.user.phone}` : ""}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          style={{ alignSelf: "start" }}
                          disabled={!vehicleForm.carOwnerId}
                          onClick={() => setFleetWizardStep(2)}
                        >
                          Continue →
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={(e) => handleCreateOwner(e, true)} className={styles.wizardFormGrid}>
                        {orgs.length > 1 && (
                          <label className={`${styles.fieldLabel} ${styles.wizardFullField}`}>
                            Organisation
                            <select
                              className={styles.fieldInput}
                              value={ownerForm.organizationId || selectedOrganizationId}
                              onChange={(e) => setOwnerForm({ ...ownerForm, organizationId: e.target.value })}
                            >
                              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                          </label>
                        )}
                        {[
                          { key: "fullName", label: "Full name",  placeholder: "Akosua Frimpong",    required: true  },
                          { key: "phone",    label: "Phone",      placeholder: "+233 24 000 0000",    required: false },
                          { key: "email",    label: "Email",      placeholder: "akosua@example.com",  required: false },
                          { key: "address",  label: "Address",    placeholder: "Tema, Greater Accra", required: false },
                          { key: "password", label: "Password",   placeholder: DEFAULT_OWNER_PASSWORD, required: false },
                        ].map(({ key, label, placeholder, required }) => (
                          <label key={key} className={styles.fieldLabel}>
                            {label}
                            <input
                              className={styles.fieldInput}
                              placeholder={placeholder}
                              required={required}
                              type={key === "password" ? "password" : "text"}
                              value={(ownerForm as Record<string, string>)[key]}
                              onChange={(e) => setOwnerForm({ ...ownerForm, [key]: e.target.value })}
                            />
                          </label>
                        ))}
                        <button
                          className={`${styles.primaryButton} ${styles.wizardFullField}`}
                          type="submit"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? "Creating…" : "Create owner & continue →"}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* ── Step 2: Vehicle ── */}
                {fleetWizardStep === 2 && (
                  <div style={{ display: "grid", gap: 20 }}>
                    <div>
                      <h3 className={styles.wizardTitle}>Step 2 — Register vehicle</h3>
                      <p className={styles.wizardSub}>
                        Owner: <strong>{scopedOwners.find((o) => o.id === vehicleForm.carOwnerId)?.user.fullName ?? "—"}</strong>
                      </p>
                    </div>
                    <form onSubmit={handleRegisterVehicle} className={styles.wizardFormGrid}>
                      {orgs.length > 1 && (
                        <label className={`${styles.fieldLabel} ${styles.wizardFullField}`}>
                          Organisation
                          <select
                            className={styles.fieldInput}
                            value={vehicleForm.organizationId || selectedOrganizationId}
                            onChange={(e) => setVehicleForm({ ...vehicleForm, organizationId: e.target.value })}
                          >
                            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        </label>
                      )}
                      {[
                        { key: "registrationNumber", label: "Registration number", placeholder: "GR-1234-24", required: true  },
                        { key: "vehicleType",        label: "Vehicle type",        placeholder: "Trotro",      required: true  },
                        { key: "make",               label: "Make",                placeholder: "Toyota",      required: false },
                        { key: "model",              label: "Model",               placeholder: "HiAce",       required: false },
                        { key: "color",              label: "Colour",              placeholder: "Yellow",      required: false },
                      ].map(({ key, label, placeholder, required }) => (
                        <label key={key} className={styles.fieldLabel}>
                          {label}
                          <input
                            className={styles.fieldInput}
                            placeholder={placeholder}
                            required={required}
                            value={(vehicleForm as Record<string, string>)[key]}
                            onChange={(e) => setVehicleForm({ ...vehicleForm, [key]: e.target.value })}
                          />
                        </label>
                      ))}
                      <div className={styles.wizardFullField} style={{ display: "flex", gap: 10 }}>
                        <button type="button" className={styles.secondaryButton} onClick={() => setFleetWizardStep(1)}>
                          ← Back
                        </button>
                        <button className={styles.primaryButton} type="submit" disabled={isSubmitting} style={{ flex: 1 }}>
                          {isSubmitting ? "Registering…" : "Register vehicle & continue →"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* ── Step 3: Assign driver ── */}
                {fleetWizardStep === 3 && (
                  <div style={{ display: "grid", gap: 20 }}>
                    <div>
                      <h3 className={styles.wizardTitle}>Step 3 — Assign driver</h3>
                      <p className={styles.wizardSub}>
                        Vehicle <strong>{vehicles.find((v) => v.id === wizardCreatedVehicleId)?.registrationNumber ?? "registered"}</strong> is ready.
                        Assign a driver now, or skip and do it later.
                      </p>
                    </div>
                    <form onSubmit={handleAssignDriver} style={{ display: "grid", gap: 12 }}>
                      <label className={styles.fieldLabel}>
                        Driver
                        <select
                          className={styles.fieldInput}
                          required
                          value={assignmentForm.driverId}
                          onChange={(e) => setAssignmentForm({ ...assignmentForm, driverId: e.target.value })}
                        >
                          <option value="">Select driver…</option>
                          {scopedDrivers.filter((d) => d.status === "ACTIVE").map((d) => (
                            <option key={d.id} value={d.id}>{d.user.fullName} — {d.licenseNumber}</option>
                          ))}
                        </select>
                      </label>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => { setNotice("Vehicle registered. Driver assignment skipped."); resetWizard(); }}
                        >
                          Skip — assign later
                        </button>
                        <button className={styles.primaryButton} type="submit" disabled={isSubmitting} style={{ flex: 1 }}>
                          {isSubmitting ? "Assigning…" : "Assign driver & finish"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>

            {/* ── Fleet tab bar + card grid + drawer ── */}
            <div className={styles.fleetLayout}>

              {/* Left: vehicle card grid */}
              <div className={styles.fleetMain}>
                {/* Tab bar */}
                <div className={styles.peopleTabBar}>
                  <button
                    className={`${styles.peopleTab} ${fleetView === "vehicles" ? styles.peopleTabActive : ""}`}
                    onClick={() => { setFleetView("vehicles"); setSelectedVehicle(null); }}
                  >
                    Vehicles ({scopedVehicles.length})
                  </button>
                  <button
                    className={`${styles.peopleTab} ${fleetView === "assignments" ? styles.peopleTabActive : ""}`}
                    onClick={() => { setFleetView("assignments"); setSelectedVehicle(null); }}
                  >
                    Active assignments ({activeScopedAssignments.length})
                  </button>
                </div>

                {fleetView === "vehicles" && (
                  <>
                    <div className={styles.peopleCardsHeader}>
                      <input
                        className={`${styles.fieldInput} ${styles.searchInput}`}
                        placeholder="Search vehicles…"
                        value={vehicleSearch}
                        onChange={(e) => setVehicleSearch(e.target.value)}
                      />
                    </div>
                    <div className={styles.vehicleGrid}>
                      {(() => {
                        const q = vehicleSearch.toLowerCase();
                        const filtered = scopedVehicles.filter((v) =>
                          !q ||
                          v.registrationNumber.toLowerCase().includes(q) ||
                          v.vehicleType.toLowerCase().includes(q) ||
                          (v.make ?? "").toLowerCase().includes(q) ||
                          (v.model ?? "").toLowerCase().includes(q) ||
                          (v.carOwner?.user.fullName ?? "").toLowerCase().includes(q)
                        );
                        return filtered.length > 0 ? filtered.map((v) => {
                          const assignment = activeScopedAssignments.find((a) => a.vehicle.id === v.id);
                          return (
                            <div
                              key={v.id}
                              className={`${styles.vehicleCard} ${selectedVehicle?.id === v.id ? styles.vehicleCardActive : ""}`}
                              onClick={() => setSelectedVehicle(selectedVehicle?.id === v.id ? null : v)}
                            >
                              <div className={styles.vehicleCardPlate}>{v.registrationNumber}</div>
                              <div className={styles.vehicleCardType}>{v.vehicleType}</div>
                              {(v.make || v.model) && (
                                <div className={styles.vehicleCardModel}>{[v.make, v.model].filter(Boolean).join(" ")}</div>
                              )}
                              <div className={styles.vehicleCardBadges}>
                                <span className={
                                  v.status === "ACTIVE" ? styles.chipGreen :
                                  v.status === "SUSPENDED" ? styles.chipRed : styles.chipAmber
                                }>{humanize(v.status)}</span>
                                {assignment
                                  ? <span className={styles.chipGreen}>{assignment.driver.user.fullName}</span>
                                  : <span className={styles.chipAmber}>Unassigned</span>
                                }
                              </div>
                              {v.carOwner && (
                                <div className={styles.vehicleCardOwner}>{v.carOwner.user.fullName}</div>
                              )}
                            </div>
                          );
                        }) : <p className={styles.emptyState}>No vehicles match.</p>;
                      })()}
                    </div>
                  </>
                )}

                {fleetView === "assignments" && (
                  <div className={styles.tableWrapper} style={{ marginTop: 12 }}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Driver</th><th>Vehicle</th><th>Since</th><th></th></tr>
                      </thead>
                      <tbody>
                        {activeScopedAssignments.map((a) => (
                          <tr key={a.id}>
                            <td>{a.driver.user.fullName}</td>
                            <td style={{ fontWeight: 700 }}>{a.vehicle.registrationNumber}</td>
                            <td>{formatDate(a.assignedAt)}</td>
                            <td>
                              <button
                                className={`${styles.secondaryButton} ${styles.dangerButton}`}
                                style={{ minHeight: 30, fontSize: 12 }}
                                onClick={() => handleRemoveAssignment(a.id)}
                              >
                                Unassign
                              </button>
                            </td>
                          </tr>
                        ))}
                        {activeScopedAssignments.length === 0 && (
                          <tr><td colSpan={4} className={styles.emptyState}>No active assignments.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Right: vehicle detail drawer */}
              {selectedVehicle && (
                <div className={styles.profileDrawer}>
                  <div className={styles.profileDrawerHeader}>
                    <div>
                      <div className={styles.profileAvatar} style={{ borderRadius: 10, fontSize: 14 }}>
                        {selectedVehicle.vehicleType.slice(0, 2).toUpperCase()}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={styles.profileName}>{selectedVehicle.registrationNumber}</div>
                      <div className={styles.profileOrg}>{selectedVehicle.vehicleType}{selectedVehicle.make ? ` · ${selectedVehicle.make}` : ""}{selectedVehicle.model ? ` ${selectedVehicle.model}` : ""}</div>
                    </div>
                    <button className={styles.drawerClose} onClick={() => setSelectedVehicle(null)}>✕</button>
                  </div>

                  {/* Status + assignment chips */}
                  <div className={styles.profileStats}>
                    <div className={styles.profileStat}>
                      <span className={styles.profileStatLabel}>Status</span>
                      <span className={
                        selectedVehicle.status === "ACTIVE" ? styles.chipGreen :
                        selectedVehicle.status === "SUSPENDED" ? styles.chipRed : styles.chipAmber
                      }>{humanize(selectedVehicle.status)}</span>
                    </div>
                    <div className={styles.profileStat}>
                      <span className={styles.profileStatLabel}>Driver</span>
                      {(() => {
                        const a = activeScopedAssignments.find((x) => x.vehicle.id === selectedVehicle.id);
                        return a
                          ? <span className={styles.chipGreen}>{a.driver.user.fullName}</span>
                          : <span className={styles.chipAmber}>Unassigned</span>;
                      })()}
                    </div>
                  </div>

                  <div className={styles.profileFields}>
                    {[
                      { label: "Owner",   value: selectedVehicle.carOwner?.user.fullName ?? "—" },
                      { label: "Colour",  value: selectedVehicle.color ?? "—" },
                      { label: "Make",    value: selectedVehicle.make ?? "—" },
                      { label: "Model",   value: selectedVehicle.model ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className={styles.profileField}>
                        <span className={styles.profileFieldLabel}>{label}</span>
                        <span className={styles.profileFieldValue}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Recent trips */}
                  {(() => {
                    const vTrips = scopedTrips.filter((t) => t.vehicle?.id === selectedVehicle.id).slice(0, 5);
                    return vTrips.length > 0 ? (
                      <div className={styles.profileSection}>
                        <div className={styles.profileSectionTitle}>Recent trips</div>
                        {vTrips.map((t) => (
                          <div key={t.id} className={styles.profileTrip}>
                            <span>{t.driver?.user.fullName ?? "—"}</span>
                            <span className={
                              t.status === "COMPLETED" ? styles.chipGreen :
                              t.status === "IN_PROGRESS" ? styles.chipAmber : styles.chipRed
                            }>{humanize(t.status)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}

                  {/* Actions */}
                  <div className={styles.profileActions}>
                    <button
                      className={styles.primaryButton}
                      style={{ gridColumn: "1/-1" }}
                      onClick={() => openEditVehicle(selectedVehicle)}
                    >
                      Edit vehicle
                    </button>
                    {(() => {
                      const a = activeScopedAssignments.find((x) => x.vehicle.id === selectedVehicle.id);
                      return a ? (
                        <button
                          className={`${styles.secondaryButton} ${styles.dangerButton}`}
                          onClick={() => { handleRemoveAssignment(a.id); setSelectedVehicle(null); }}
                        >
                          Unassign driver
                        </button>
                      ) : null;
                    })()}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Trips ────────────────────────────────────────────────────────── */}
        {activeSection === "trips" && (
          <section className={styles.sectionGridSm}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Trips ({filteredTrips.length})</h2>
              <div className={styles.filterRow}>
                <select
                  className={styles.filterSelect}
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setTripPage(1); }}
                >
                  <option value="">All statuses</option>
                  {["IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
                    <option key={s} value={s}>{humanize(s)}</option>
                  ))}
                </select>
                <input
                  className={styles.filterInput}
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setTripPage(1); }}
                />
              </div>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Driver</th><th>Vehicle</th><th>Route</th><th>Status</th>
                    <th>Start</th><th>End</th><th>Max speed</th><th>Distance</th><th>Violations</th>
                    {isOrgAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {pagedTrips.map((t) => (
                    <tr key={t.id}>
                      <td>{t.driver?.user.fullName ?? "—"}</td>
                      <td>{t.vehicle?.registrationNumber ?? "—"}</td>
                      <td>{t.routeTemplate?.name ?? "—"}</td>
                      <td style={{ color: statusColor(t.status), fontWeight: 700 }}>{humanize(t.status)}</td>
                      <td>{formatDate(t.startTime)}</td>
                      <td>{t.endTime ? formatDate(t.endTime) : "—"}</td>
                      <td>{t.maxSpeed ? `${Math.round(t.maxSpeed)} km/h` : "—"}</td>
                      <td>{t.distance ? `${t.distance.toFixed(1)} km` : "—"}</td>
                      <td style={{ color: (t._count?.violations ?? 0) > 0 ? "var(--red)" : "inherit", fontWeight: 700 }}>
                        {t._count?.violations ?? 0}
                      </td>
                      {isOrgAdmin && (
                        <td>
                          {t.status === "IN_PROGRESS" && (
                            <button
                              className={styles.dangerButton}
                              onClick={() => handleCancelTrip(t.id)}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {pagedTrips.length === 0 && (
                    <tr><td colSpan={isOrgAdmin ? 10 : 9} className={styles.emptyState}>No trips found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <PagerRow
              page={tripPage}
              totalPages={Math.ceil(filteredTrips.length / PAGE_SIZE)}
              total={filteredTrips.length}
              onPrev={() => setTripPage((p) => p - 1)}
              onNext={() => setTripPage((p) => p + 1)}
            />
          </section>
        )}

        {/* ── Violations ───────────────────────────────────────────────────── */}
        {activeSection === "violations" && (
          <section className={styles.sectionGridSm}>
	            <div className={styles.sectionHeader}>
	              <h2 className={styles.sectionTitle}>
	                Violations ({violationPagination?.total ?? scopedViolations.length})
	              </h2>
              <div className={styles.filterRow}>
                <select
                  className={styles.filterSelect}
                  value={severityFilter}
                  onChange={(e) => {
	                    setSeverityFilter(e.target.value);
	                    setViolationPage(1);
	                    void loadViolations(token, 1, e.target.value, selectedOrganizationId);
	                  }}
                >
                  <option value="">All severities</option>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                    <option key={s} value={s}>{humanize(s)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Driver</th><th>Vehicle</th><th>Colour</th><th>Speed</th>
                    <th>Limit</th><th>Severity</th><th>Type</th><th>Time</th>
                  </tr>
                </thead>
                <tbody>
	                  {scopedViolations.map((v) => (
                    <tr key={v.id}>
                      <td>{v.driver?.user.fullName ?? "—"}</td>
                      <td>{v.vehicle?.registrationNumber ?? "—"}</td>
                      <td>{v.vehicle?.color ?? "—"}</td>
                      <td style={{ color: "var(--red)", fontWeight: 700 }}>{Math.round(v.speed)} km/h</td>
                      <td>{Math.round(v.speedLimit)} km/h</td>
                      <td style={{ fontWeight: 700, color: v.severity === "CRITICAL" ? "var(--red)" : v.severity === "HIGH" ? "var(--amber)" : "var(--text-muted)" }}>
                        {humanize(v.severity)}
                      </td>
                      <td>{humanize(v.violationType)}</td>
                      <td>{formatDate(v.violationTime)}</td>
                    </tr>
                  ))}
	                  {scopedViolations.length === 0 && (
                    <tr><td colSpan={8} className={styles.emptyState}>No violations.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {violationPagination && (
              <PagerRow
                page={violationPage}
                totalPages={violationPagination.totalPages}
                total={violationPagination.total}
                onPrev={() => {
                  const next = violationPage - 1;
                  setViolationPage(next);
	                  void loadViolations(token, next, severityFilter, selectedOrganizationId);
                }}
                onNext={() => {
                  const next = violationPage + 1;
                  setViolationPage(next);
	                  void loadViolations(token, next, severityFilter, selectedOrganizationId);
                }}
              />
            )}
          </section>
        )}

        {/* ── Alerts ───────────────────────────────────────────────────────── */}
        {activeSection === "alerts" && (
          <section className={styles.sectionGridSm}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                Alerts
                {unreadCount > 0 && <span className={styles.badge}>{unreadCount} unread</span>}
              </h2>
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
                  <div className={styles.alertMeta} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{humanize(alert.deliveryChannel)} · {formatDate(alert.createdAt)}</span>
                    {isOrgAdmin && (
                      <select
                        className={styles.filterSelect}
                        style={{ padding: "2px 6px", fontSize: 12 }}
                        value={alert.deliveryStatus}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          void handleUpdateDeliveryStatus(alert.id, e.target.value);
                        }}
                      >
                        {["PENDING", "SENT", "FAILED"].map((s) => (
                          <option key={s} value={s}>{humanize(s)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
              {alerts.length === 0 && <p className={styles.emptyState}>No alerts.</p>}
            </div>
          </section>
        )}
      </main>

      {/* ── Change password modal ── */}
      {showChangePassword && (
        <div className={styles.modalBackdrop} onClick={() => setShowChangePassword(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Change password</h3>
              <button className={styles.drawerClose} onClick={() => setShowChangePassword(false)}>✕</button>
            </div>
            <form onSubmit={handleChangePassword} className={styles.formGrid}>
              <label className={styles.fieldLabel}>
                Current password
                <input
                  className={styles.fieldInput}
                  type="password"
                  required
                  autoComplete="current-password"
                  value={changePasswordForm.currentPassword}
                  onChange={(e) => setChangePasswordForm({ ...changePasswordForm, currentPassword: e.target.value })}
                />
              </label>
              <label className={styles.fieldLabel}>
                New password
                <input
                  className={styles.fieldInput}
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  value={changePasswordForm.newPassword}
                  onChange={(e) => setChangePasswordForm({ ...changePasswordForm, newPassword: e.target.value })}
                />
              </label>
              <label className={styles.fieldLabel}>
                Confirm new password
                <input
                  className={styles.fieldInput}
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  value={changePasswordForm.confirmPassword}
                  onChange={(e) => setChangePasswordForm({ ...changePasswordForm, confirmPassword: e.target.value })}
                />
              </label>
              <div style={{ display: "flex", gap: 10, gridColumn: "1/-1" }}>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowChangePassword(false)}>
                  Cancel
                </button>
                <button className={styles.primaryButton} type="submit" disabled={isSubmitting} style={{ flex: 1 }}>
                  {isSubmitting ? "Saving…" : "Update password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Organisation modal ── */}
      {editingOrg && (
        <div className={styles.modalBackdrop} onClick={() => setEditingOrg(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit organisation</h3>
              <button className={styles.drawerClose} onClick={() => setEditingOrg(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateOrg} className={styles.formGrid}>
              {[
                { key: "name",          label: "Name",           placeholder: editingOrg.name },
                { key: "contactPerson", label: "Contact person", placeholder: "e.g. Kwame Mensah" },
                { key: "phone",         label: "Phone",          placeholder: editingOrg.phone ?? "+233 20 000 0000" },
                { key: "email",         label: "Email",          placeholder: editingOrg.email ?? "org@example.com" },
                { key: "address",       label: "Address",        placeholder: editingOrg.address ?? "Accra, Ghana" },
              ].map(({ key, label, placeholder }) => (
                <label key={key} className={styles.fieldLabel}>
                  {label}
                  <input
                    className={styles.fieldInput}
                    placeholder={placeholder}
                    value={(orgEditForm as Record<string, string>)[key]}
                    onChange={(e) => setOrgEditForm({ ...orgEditForm, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className={styles.fieldLabel}>
                Status
                <select
                  className={styles.fieldInput}
                  value={orgEditForm.status}
                  onChange={(e) => setOrgEditForm({ ...orgEditForm, status: e.target.value })}
                >
                  {["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"].map((s) => (
                    <option key={s} value={s}>{humanize(s)}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", gap: 10, gridColumn: "1/-1" }}>
                <button type="button" className={styles.secondaryButton} onClick={() => setEditingOrg(null)}>Cancel</button>
                <button className={styles.primaryButton} type="submit" disabled={isSubmitting} style={{ flex: 1 }}>
                  {isSubmitting ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Driver modal ── */}
      {editingDriver && (
        <div className={styles.modalBackdrop} onClick={() => setEditingDriver(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit driver</h3>
              <button className={styles.drawerClose} onClick={() => setEditingDriver(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateDriver} className={styles.formGrid}>
              {[
                { key: "fullName",  label: "Full name",   placeholder: editingDriver.user.fullName },
                { key: "phone",     label: "Phone",        placeholder: editingDriver.user.phone ?? "+233 20 000 0000" },
                { key: "email",     label: "Email",        placeholder: editingDriver.user.email ?? "driver@example.com" },
                { key: "nationalId",label: "National ID",  placeholder: "GHA-000000000-0" },
              ].map(({ key, label, placeholder }) => (
                <label key={key} className={styles.fieldLabel}>
                  {label}
                  <input
                    className={styles.fieldInput}
                    placeholder={placeholder}
                    value={(driverEditForm as Record<string, string>)[key]}
                    onChange={(e) => setDriverEditForm({ ...driverEditForm, [key]: e.target.value })}
                  />
                </label>
              ))}
              <div style={{ display: "flex", gap: 10, gridColumn: "1/-1" }}>
                <button type="button" className={styles.secondaryButton} onClick={() => setEditingDriver(null)}>Cancel</button>
                <button className={styles.primaryButton} type="submit" disabled={isSubmitting} style={{ flex: 1 }}>
                  {isSubmitting ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Owner modal ── */}
      {editingOwner && (
        <div className={styles.modalBackdrop} onClick={() => setEditingOwner(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit owner</h3>
              <button className={styles.drawerClose} onClick={() => setEditingOwner(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateOwner} className={styles.formGrid}>
              {[
                { key: "fullName", label: "Full name", placeholder: editingOwner.user.fullName },
                { key: "phone",    label: "Phone",      placeholder: editingOwner.user.phone ?? "+233 24 000 0000" },
                { key: "email",    label: "Email",      placeholder: editingOwner.user.email ?? "owner@example.com" },
                { key: "address",  label: "Address",    placeholder: editingOwner.address ?? "Tema, Greater Accra" },
              ].map(({ key, label, placeholder }) => (
                <label key={key} className={styles.fieldLabel}>
                  {label}
                  <input
                    className={styles.fieldInput}
                    placeholder={placeholder}
                    value={(ownerEditForm as Record<string, string>)[key]}
                    onChange={(e) => setOwnerEditForm({ ...ownerEditForm, [key]: e.target.value })}
                  />
                </label>
              ))}
              <div style={{ display: "flex", gap: 10, gridColumn: "1/-1" }}>
                <button type="button" className={styles.secondaryButton} onClick={() => setEditingOwner(null)}>Cancel</button>
                <button className={styles.primaryButton} type="submit" disabled={isSubmitting} style={{ flex: 1 }}>
                  {isSubmitting ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Vehicle modal ── */}
      {editingVehicle && (
        <div className={styles.modalBackdrop} onClick={() => setEditingVehicle(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit vehicle — {editingVehicle.registrationNumber}</h3>
              <button className={styles.drawerClose} onClick={() => setEditingVehicle(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateVehicle} className={styles.formGrid}>
              {[
                { key: "vehicleType", label: "Vehicle type", placeholder: editingVehicle.vehicleType },
                { key: "make",        label: "Make",          placeholder: editingVehicle.make ?? "Toyota" },
                { key: "model",       label: "Model",         placeholder: editingVehicle.model ?? "HiAce" },
                { key: "color",       label: "Colour",        placeholder: editingVehicle.color ?? "Yellow" },
              ].map(({ key, label, placeholder }) => (
                <label key={key} className={styles.fieldLabel}>
                  {label}
                  <input
                    className={styles.fieldInput}
                    placeholder={placeholder}
                    value={(vehicleEditForm as Record<string, string>)[key]}
                    onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className={styles.fieldLabel}>
                Status
                <select
                  className={styles.fieldInput}
                  value={vehicleEditForm.status}
                  onChange={(e) => setVehicleEditForm({ ...vehicleEditForm, status: e.target.value })}
                >
                  {["ACTIVE", "INACTIVE", "MAINTENANCE"].map((s) => (
                    <option key={s} value={s}>{humanize(s)}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", gap: 10, gridColumn: "1/-1" }}>
                <button type="button" className={styles.secondaryButton} onClick={() => setEditingVehicle(null)}>Cancel</button>
                <button className={styles.primaryButton} type="submit" disabled={isSubmitting} style={{ flex: 1 }}>
                  {isSubmitting ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Route modal ── */}
      {editingRoute && (
        <div className={styles.modalBackdrop} onClick={() => setEditingRoute(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit route — {editingRoute.name}</h3>
              <button className={styles.drawerClose} onClick={() => setEditingRoute(null)}>✕</button>
            </div>
            <form onSubmit={handleUpdateRoute} className={styles.formGrid}>
              {[
                { key: "name",                     label: "Route name",      placeholder: editingRoute.name,          type: "text"   },
                { key: "origin",                   label: "Origin",           placeholder: editingRoute.origin,         type: "text"   },
                { key: "destination",              label: "Destination",      placeholder: editingRoute.destination,    type: "text"   },
                { key: "estimatedDistanceKm",      label: "Distance (km)",    placeholder: "e.g. 250",                 type: "number" },
                { key: "estimatedDurationMinutes", label: "Duration (min)",   placeholder: "e.g. 180",                 type: "number" },
                { key: "speedLimit",               label: "Speed limit km/h", placeholder: String(primaryOrg?.speedLimit ?? 80), type: "number" },
              ].map(({ key, label, placeholder, type }) => (
                <label key={key} className={styles.fieldLabel}>
                  {label}
                  <input
                    className={styles.fieldInput}
                    placeholder={placeholder}
                    type={type}
                    min={type === "number" ? "1" : undefined}
                    step={key === "estimatedDistanceKm" ? "0.1" : type === "number" ? "1" : undefined}
                    value={(routeEditForm as Record<string, string>)[key]}
                    onChange={(e) => setRouteEditForm({ ...routeEditForm, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className={styles.fieldLabel}>
                Status
                <select
                  className={styles.fieldInput}
                  value={routeEditForm.status}
                  onChange={(e) => setRouteEditForm({ ...routeEditForm, status: e.target.value })}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
              <div style={{ display: "flex", gap: 10, gridColumn: "1/-1" }}>
                <button type="button" className={styles.secondaryButton} onClick={() => setEditingRoute(null)}>Cancel</button>
                <button className={styles.primaryButton} type="submit" disabled={isSubmitting} style={{ flex: 1 }}>
                  {isSubmitting ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
