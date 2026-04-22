"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

import {
  ERROR_TOAST_DISMISS_MS,
  NOTICE_TOAST_DISMISS_MS,
  useAutoDismissMessage,
} from "../lib/useAutoDismissMessage";
import { API_BASE } from "../lib/api";
import styles from "./page.module.css";

const DEFAULT_DRIVER_PASSWORD = "driver@1";
const DEFAULT_ORG_STAFF_PASSWORD = "staff@1";
const DEFAULT_OWNER_PASSWORD = "owner@1";
const DEFAULT_AUTHORITY_PASSWORD = "authority@1";

type Section =
  | "overview"
  | "organizations"
  | "authorities"
  | "people"
  | "routes"
  | "fleet"
  | "trips"
  | "violations"
  | "alerts"
  | "repeat-offenders"
  | "reports"
  | "audit";

type User = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  status?: string;
  authorityIds?: string[];
  authorityUserRole?: "ADMIN" | "USER";
};

type UserRole =
  | "SUPER_ADMIN"
  | "STAFF"
  | "ORG_ADMIN"
  | "ORG_OFFICER"
  | "DRIVER"
  | "CAR_OWNER"
  | "AUTHORITY";

type Summary = {
  organizations: number;
  drivers: number;
  vehicles: number;
  trips: number;
  activeTrips: number;
  violations: number;
  criticalViolations: number;
  alerts: number;
};

type Organization = {
  id: string;
  name: string;
  type: string;
  status: string;
  phone?: string | null;
  email?: string | null;
  speedLimit?: number | null;
  _count?: {
    drivers: number;
    vehicles: number;
    trips: number;
    violations: number;
  };
};

type Authority = {
  id: string;
  name: string;
  type: string;
  status: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
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
  user: User;
};

type Driver = {
  id: string;
  licenseNumber: string;
  consentGiven: boolean;
  status: string;
  user: User;
  organization: Organization;
};

type CarOwner = {
  id: string;
  address?: string | null;
  user: User;
  _count?: {
    vehicles: number;
    trips: number;
    violations: number;
  };
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
  _count?: {
    trips: number;
  };
};

type Trip = {
  id: string;
  status: string;
  startTime: string;
  endTime?: string | null;
  averageSpeed?: number | null;
  maxSpeed?: number | null;
  distance?: number | null;
  driver?: Driver;
  vehicle?: Vehicle;
  organization?: Organization;
  routeTemplate?: RouteTemplate | null;
  _count?: {
    locations: number;
    violations: number;
    alerts: number;
  };
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

type Alert = {
  id: string;
  alertType: string;
  message: string;
  deliveryStatus: string;
  deliveryChannel: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
};

type RepeatOffender = {
  driver?: Driver | null;
  violationCount: number;
  lastViolationAt?: string | null;
};

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  createdAt: string;
  user?: User | null;
};

type ReportFilters = {
  organizationId: string;
  driverId: string;
  vehicleId: string;
  severity: string;
  startDate: string;
  endDate: string;
};

type DashboardData = {
  summary: Summary;
  organizations: Organization[];
  authorities: Authority[];
  authorityUsers: AuthorityUser[];
  drivers: Driver[];
  owners: CarOwner[];
  vehicles: Vehicle[];
  assignments: Assignment[];
  routeTemplates: RouteTemplate[];
  trips: Trip[];
  violations: Violation[];
  alerts: Alert[];
  repeatOffenders: RepeatOffender[];
  auditLogs: AuditLog[];
};

const emptySummary: Summary = {
  organizations: 0,
  drivers: 0,
  vehicles: 0,
  trips: 0,
  activeTrips: 0,
  violations: 0,
  criticalViolations: 0,
  alerts: 0,
};

const emptyData: DashboardData = {
  summary: emptySummary,
  organizations: [],
  authorities: [],
  authorityUsers: [],
  drivers: [],
  owners: [],
  vehicles: [],
  assignments: [],
  routeTemplates: [],
  trips: [],
  violations: [],
  alerts: [],
  repeatOffenders: [],
  auditLogs: [],
};

const sections: Array<{ id: Section; label: string; icon: string; group: string }> = [
  { id: "overview",       label: "Overview",       icon: "⊡",  group: "main"   },
  { id: "organizations",  label: "Organisations",  icon: "⬡",  group: "manage" },
  { id: "authorities",    label: "Authorities",    icon: "◇",  group: "manage" },
  { id: "people",         label: "Drivers & Owners", icon: "◫", group: "monitor" },
  { id: "routes",         label: "Route Templates", icon: "↔", group: "monitor" },
  { id: "fleet",          label: "Fleet",          icon: "▣",  group: "monitor" },
  { id: "trips",          label: "Trips",          icon: "⌁",  group: "monitor" },
  { id: "violations",     label: "Violations",     icon: "!",  group: "monitor" },
  { id: "alerts",         label: "Alerts",         icon: "◦",  group: "monitor" },
  { id: "repeat-offenders", label: "Repeat Offenders", icon: "↻", group: "reports" },
  { id: "reports",        label: "Violation Reports", icon: "▤", group: "reports" },
  { id: "audit",          label: "Audit Logs",     icon: "⌕",  group: "reports" },
];

const SYSTEM_ROLES = new Set<string>(["SUPER_ADMIN", "STAFF"]);

const portalPathByRole: Partial<Record<UserRole, string>> = {
  ORG_ADMIN: "/org",
  ORG_OFFICER: "/org",
  CAR_OWNER: "/owner",
  AUTHORITY: "/authority",
};

function canUseMainDashboard(role?: string | null) {
  return Boolean(role && SYSTEM_ROLES.has(role));
}

function persistPortalSession(user: User, token: string) {
  if (user.role === "ORG_ADMIN" || user.role === "ORG_OFFICER") {
    window.localStorage.setItem("smartrans_org_token", token);
    window.localStorage.setItem("smartrans_org_user", JSON.stringify(user));
  }

  if (user.role === "CAR_OWNER") {
    window.localStorage.setItem("smartrans_owner_token", token);
    window.localStorage.setItem("smartrans_owner_user", JSON.stringify(user));
  }

  if (user.role === "AUTHORITY") {
    window.localStorage.setItem("smartrans_token", token);
    window.localStorage.setItem("smartrans_user", JSON.stringify(user));
  }
}

async function apiRequest<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.message ?? `Request failed: ${response.status}`);
  }

  return body.data as T;
}

const humanize = (value: string) => value.replaceAll("_", " ");

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString() : "Open");

const emptyReportFilters: ReportFilters = {
  organizationId: "",
  driverId: "",
  vehicleId: "",
  severity: "",
  startDate: "",
  endDate: "",
};

export default function Home() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reportFilters, setReportFilters] = useState<ReportFilters>(emptyReportFilters);
  const [violationPage, setViolationPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const PAGE_SIZE = 25;

  const [organizationForm, setOrganizationForm] = useState({
    name: "",
    type: "STATION",
    status: "ACTIVE",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    adminFullName: "",
    adminEmail: "",
    adminPhone: "",
    adminPassword: DEFAULT_ORG_STAFF_PASSWORD,
  });

  const [authorityForm, setAuthorityForm] = useState({
    name: "",
    type: "REGULATOR",
    status: "ACTIVE",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    adminFullName: "",
    adminEmail: "",
    adminPhone: "",
    adminPassword: DEFAULT_AUTHORITY_PASSWORD,
  });

  const [ownerForm, setOwnerForm] = useState({
    organizationId: "",
    fullName: "",
    email: "",
    phone: "",
    address: "",
    password: DEFAULT_OWNER_PASSWORD,
  });

  const [driverForm, setDriverForm] = useState({
    organizationId: "",
    fullName: "",
    email: "",
    phone: "",
    licenseNumber: "",
    nationalId: "",
    password: DEFAULT_DRIVER_PASSWORD,
    consentGiven: true,
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

  const [assignmentForm, setAssignmentForm] = useState({
    driverId: "",
    vehicleId: "",
  });

  const [routeTemplateForm, setRouteTemplateForm] = useState({
    organizationId: "",
    name: "",
    origin: "",
    destination: "",
    estimatedDistanceKm: "",
    estimatedDurationMinutes: "",
    speedLimit: "",
  });

  useAutoDismissMessage(notice, setNotice, NOTICE_TOAST_DISMISS_MS);
  useAutoDismissMessage(error, setError, ERROR_TOAST_DISMISS_MS);

  const buildViolationQuery = (filters: ReportFilters = reportFilters) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    const query = params.toString();
    return query ? `?${query}` : "";
  };

  const metrics = useMemo(
    () => [
      { label: "Active trips", value: data.summary.activeTrips, trend: `${data.summary.trips} total trips` },
      {
        label: "Open violations",
        value: data.summary.violations,
        trend: `${data.summary.criticalViolations} critical`,
      },
      { label: "Registered drivers", value: data.summary.drivers, trend: `${data.summary.organizations} orgs` },
      { label: "Tracked vehicles", value: data.summary.vehicles, trend: `${data.summary.alerts} alerts` },
    ],
    [data.summary],
  );

  const workQueue = useMemo(() => {
    const queue = [];
    const pendingOrganization = data.organizations.find((organization) => organization.status === "PENDING");
    const criticalViolation = data.violations.find((violation) => violation.severity === "CRITICAL");
    const pendingAlert = data.alerts.find((alert) => alert.deliveryStatus === "PENDING");
    const inactiveAssignment = data.assignments.find((assignment) => !assignment.isActive);

    if (pendingOrganization) {
      queue.push(`Approve ${pendingOrganization.name}`);
    }

    if (criticalViolation) {
      queue.push(`Review critical violation for ${criticalViolation.driver?.user?.fullName ?? "driver"}`);
    }

    if (pendingAlert) {
      queue.push(`Confirm alert delivery: ${humanize(pendingAlert.alertType)}`);
    }

    if (inactiveAssignment) {
      queue.push(`Check inactive assignment for ${inactiveAssignment.vehicle.registrationNumber}`);
    }

    if (queue.length === 0) {
      queue.push("No urgent actions");
    }

    return queue;
  }, [data.alerts, data.assignments, data.organizations, data.violations]);

  const searchTerm = search.trim().toLowerCase();
  const matchesSearch = (...values: Array<string | number | null | undefined>) =>
    !searchTerm || values.some((value) => String(value ?? "").toLowerCase().includes(searchTerm));
  const filteredOrganizations = data.organizations.filter((organization) =>
    matchesSearch(organization.name, organization.type, organization.status, organization.phone, organization.email),
  );
  const filteredAuthorities = data.authorities.filter((authority) =>
    matchesSearch(
      authority.name,
      authority.type,
      authority.status,
      authority.contactPerson,
      authority.phone,
      authority.email,
    ),
  );
  const filteredAuthorityUsers = data.authorityUsers.filter((authorityUser) =>
    matchesSearch(
      authorityUser.authority.name,
      authorityUser.user.fullName,
      authorityUser.user.email,
      authorityUser.user.phone,
      authorityUser.role,
      authorityUser.status,
    ),
  );
  const filteredDrivers = data.drivers.filter((driver) =>
    matchesSearch(
      driver.user.fullName,
      driver.user.email,
      driver.user.phone,
      driver.licenseNumber,
      driver.organization.name,
      driver.status,
    ),
  );
  const filteredOwners = data.owners.filter((owner) =>
    matchesSearch(owner.user.fullName, owner.user.email, owner.user.phone, owner.user.status),
  );
  const filteredVehicles = data.vehicles.filter((vehicle) =>
    matchesSearch(
      vehicle.registrationNumber,
      vehicle.vehicleType,
      vehicle.status,
      vehicle.carOwner?.user.fullName,
      vehicle.organization?.name,
    ),
  );
  const filteredAssignments = data.assignments.filter((assignment) =>
    matchesSearch(
      assignment.driver.user.fullName,
      assignment.vehicle.registrationNumber,
      assignment.isActive ? "active" : "inactive",
    ),
  );
  const filteredRouteTemplates = data.routeTemplates.filter((routeTemplate) =>
    matchesSearch(
      routeTemplate.name,
      routeTemplate.origin,
      routeTemplate.destination,
      routeTemplate.organization?.name,
      routeTemplate.status,
    ),
  );
  const filteredTrips = data.trips.filter((trip) =>
    matchesSearch(
      trip.driver?.user.fullName,
      trip.vehicle?.registrationNumber,
      trip.routeTemplate?.name,
      trip.routeTemplate?.origin,
      trip.routeTemplate?.destination,
      trip.status,
    ),
  );
  const filteredViolations = data.violations.filter((violation) =>
    matchesSearch(
      violation.driver?.user.fullName,
      violation.vehicle?.registrationNumber,
      violation.severity,
      violation.violationType,
    ),
  );
  const filteredAlerts = data.alerts.filter((alert) =>
    matchesSearch(alert.alertType, alert.message, alert.deliveryStatus, alert.deliveryChannel),
  );
  const filteredRepeatOffenders = data.repeatOffenders.filter((offender) =>
    matchesSearch(
      offender.driver?.user.fullName,
      offender.driver?.licenseNumber,
      offender.driver?.organization.name,
      offender.violationCount,
      offender.lastViolationAt,
    ),
  );
  const filteredAuditLogs = data.auditLogs.filter((log) =>
    matchesSearch(log.user?.fullName, log.user?.email, log.action, log.entityType, log.entityId, log.createdAt),
  );
  const reportFilteredViolations = filteredViolations.filter((violation) => {
    const violationTime = new Date(violation.violationTime).getTime();
    const startTime = reportFilters.startDate ? new Date(`${reportFilters.startDate}T00:00:00.000Z`).getTime() : null;
    const endTime = reportFilters.endDate ? new Date(`${reportFilters.endDate}T23:59:59.999Z`).getTime() : null;

    return (
      (!reportFilters.organizationId || violation.organization?.id === reportFilters.organizationId) &&
      (!reportFilters.driverId || violation.driver?.id === reportFilters.driverId) &&
      (!reportFilters.vehicleId || violation.vehicle?.id === reportFilters.vehicleId) &&
      (!reportFilters.severity || violation.severity === reportFilters.severity) &&
      (startTime === null || violationTime >= startTime) &&
      (endTime === null || violationTime <= endTime)
    );
  });
  const pagedReportViolations = reportFilteredViolations.slice(
    (violationPage - 1) * PAGE_SIZE,
    violationPage * PAGE_SIZE,
  );
  const pagedAuditLogs = filteredAuditLogs.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);

  const loadDashboard = async (activeToken: string, filters: ReportFilters = reportFilters) => {
    setIsLoading(true);
    setError(null);
    const violationQuery = buildViolationQuery(filters);

    try {
      const [
        summary,
        organizations,
        authorities,
        authorityUsers,
        drivers,
        owners,
        vehicles,
        assignments,
        routeTemplates,
        trips,
        violations,
        alerts,
        repeatOffenders,
        auditLogs,
      ] = await Promise.all([
        apiRequest<Summary>("/reports/summary", activeToken),
        apiRequest<Organization[]>("/organizations", activeToken),
        apiRequest<Authority[]>("/authorities", activeToken),
        apiRequest<AuthorityUser[]>("/authorities/users", activeToken),
        apiRequest<Driver[]>("/drivers", activeToken),
        apiRequest<CarOwner[]>("/car-owners", activeToken),
        apiRequest<Vehicle[]>("/vehicles", activeToken),
        apiRequest<Assignment[]>("/assignments", activeToken),
        apiRequest<RouteTemplate[]>("/route-templates?includeInactive=true", activeToken),
        apiRequest<Trip[]>("/trips", activeToken),
        apiRequest<Violation[]>("/violations", activeToken),
        apiRequest<Alert[]>("/alerts", activeToken),
        apiRequest<RepeatOffender[]>(`/violations/repeat-offenders${violationQuery}`, activeToken).catch(() => []),
        apiRequest<AuditLog[]>("/audit-logs", activeToken).catch(() => []),
      ]);

      setData({
        summary,
        organizations,
        authorities,
        authorityUsers,
        drivers,
        owners,
        vehicles,
        assignments,
        routeTemplates,
        trips,
        violations,
        alerts,
        repeatOffenders,
        auditLogs,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to load dashboard data.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const savedToken = window.localStorage.getItem("smartransToken");
    const savedUser = window.localStorage.getItem("smartransUser");

    if (savedToken) {
      const parsedUser = savedUser ? (JSON.parse(savedUser) as User) : null;

      if (parsedUser && !canUseMainDashboard(parsedUser.role)) {
        const portalPath = portalPathByRole[parsedUser.role as UserRole];
        window.localStorage.removeItem("smartransToken");
        window.localStorage.removeItem("smartransUser");

        if (portalPath) {
          persistPortalSession(parsedUser, savedToken);
          window.location.replace(portalPath);
          return;
        }

        return;
      }

      setToken(savedToken);
      setUser(parsedUser);
      void loadDashboard(savedToken);
    }
  }, []);

  useEffect(() => {
    setDriverForm((current) => ({
      ...current,
      organizationId: current.organizationId || data.organizations[0]?.id || "",
    }));
    setVehicleForm((current) => ({
      ...current,
      organizationId: current.organizationId || data.organizations[0]?.id || "",
      carOwnerId: current.carOwnerId || data.owners[0]?.id || "",
    }));
    setOwnerForm((current) => ({
      ...current,
      organizationId: current.organizationId || data.organizations[0]?.id || "",
    }));
    setAssignmentForm((current) => ({
      ...current,
      driverId: current.driverId || data.drivers[0]?.id || "",
      vehicleId: current.vehicleId || data.vehicles[0]?.id || "",
    }));
    setRouteTemplateForm((current) => ({
      ...current,
      organizationId: current.organizationId || data.organizations[0]?.id || "",
    }));
  }, [data.drivers, data.organizations, data.owners, data.vehicles]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.message ?? "Login failed.");
      }

      if (!canUseMainDashboard(body.user.role)) {
        const signedInUser = body.user as User;
        const portalPath = portalPathByRole[signedInUser.role as UserRole];

        if (portalPath) {
          persistPortalSession(signedInUser, body.token);
          window.location.assign(portalPath);
          return;
        }

        throw new Error("Driver accounts use the SmarTrans mobile app.");
      }

      setToken(body.token);
      setUser(body.user);
      window.localStorage.setItem("smartransToken", body.token);
      window.localStorage.setItem("smartransUser", JSON.stringify(body.user));
      await loadDashboard(body.token);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Login failed.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem("smartransToken");
    window.localStorage.removeItem("smartransUser");
    setToken(null);
    setUser(null);
    setData(emptyData);
  };

  const submitMutation = async (path: string, method: string, body: unknown, successMessage: string) => {
    if (!token) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await apiRequest(path, token, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      setNotice(successMessage);
      await loadDashboard(token);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to save record.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitWithRefresh = (path: string, body: unknown, successMessage: string) =>
    submitMutation(path, "POST", body, successMessage);

  const updateWithRefresh = (path: string, body: unknown, successMessage: string) =>
    submitMutation(path, "PATCH", body, successMessage);

  const deleteWithRefresh = (path: string, successMessage: string) =>
    submitMutation(path, "DELETE", undefined, successMessage);

  const handleApplyReportFilters = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setViolationPage(1);
    if (token) {
      await loadDashboard(token, reportFilters);
    }
  };

  const handleClearReportFilters = async () => {
    setReportFilters(emptyReportFilters);
    setViolationPage(1);
    if (token) {
      await loadDashboard(token, emptyReportFilters);
    }
  };

  const handleExportViolations = async () => {
    if (!token) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${API_BASE}/reports/violations.csv${buildViolationQuery()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        let message = `Export failed: ${response.status}`;
        try {
          const body = await response.json();
          message = body.message ?? message;
        } catch {
          // The export endpoint may return non-JSON errors from proxies.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `smartrans-violations-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Violation CSV export downloaded.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to export violations.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitWithRefresh(
      "/organizations",
      {
        name: organizationForm.name,
        type: organizationForm.type,
        status: organizationForm.status,
        contactPerson: organizationForm.contactPerson || undefined,
        phone: organizationForm.phone || undefined,
        email: organizationForm.email || undefined,
        address: organizationForm.address || undefined,
        admin: organizationForm.adminFullName
          ? {
              fullName: organizationForm.adminFullName,
              email: organizationForm.adminEmail || undefined,
              phone: organizationForm.adminPhone || undefined,
              password: organizationForm.adminPassword || undefined,
            }
          : undefined,
      },
      "Organization created.",
    );
  };

  const handleCreateAuthority = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitWithRefresh(
      "/authorities",
      {
        name: authorityForm.name,
        type: authorityForm.type,
        status: authorityForm.status,
        contactPerson: authorityForm.contactPerson || undefined,
        phone: authorityForm.phone || undefined,
        email: authorityForm.email || undefined,
        address: authorityForm.address || undefined,
        admin: authorityForm.adminFullName
          ? {
              fullName: authorityForm.adminFullName,
              email: authorityForm.adminEmail || undefined,
              phone: authorityForm.adminPhone || undefined,
              password: authorityForm.adminPassword || undefined,
            }
          : undefined,
      },
      "Authority created.",
    );
  };

  const handleCreateOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitWithRefresh(
      "/car-owners",
      {
        organizationId: ownerForm.organizationId || undefined,
        fullName: ownerForm.fullName,
        email: ownerForm.email || undefined,
        phone: ownerForm.phone || undefined,
        address: ownerForm.address || undefined,
        password: ownerForm.password || undefined,
      },
      "Car owner created.",
    );
  };

  const handleCreateDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitWithRefresh(
      "/drivers",
      {
        organizationId: driverForm.organizationId,
        fullName: driverForm.fullName,
        email: driverForm.email || undefined,
        phone: driverForm.phone || undefined,
        password: driverForm.password || undefined,
        licenseNumber: driverForm.licenseNumber,
        nationalId: driverForm.nationalId || undefined,
        consentGiven: driverForm.consentGiven,
      },
      "Driver created.",
    );
  };

  const handleCreateVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitWithRefresh(
      "/vehicles",
      {
        organizationId: vehicleForm.organizationId,
        carOwnerId: vehicleForm.carOwnerId,
        registrationNumber: vehicleForm.registrationNumber,
        vehicleType: vehicleForm.vehicleType,
        make: vehicleForm.make || undefined,
        model: vehicleForm.model || undefined,
        color: vehicleForm.color || undefined,
      },
      "Vehicle created.",
    );
  };

  const handleCreateAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitWithRefresh(
      "/assignments",
      {
        driverId: assignmentForm.driverId,
        vehicleId: assignmentForm.vehicleId,
      },
      "Assignment created.",
    );
  };

  const handleCreateRouteTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitWithRefresh(
      "/route-templates",
      {
        organizationId: routeTemplateForm.organizationId,
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
      },
      "Route template created.",
    );
  };

  if (!token) {
    return (
      <main className={styles.loginShell}>
        {/* ── Left branding panel ── */}
        <div className={styles.loginBrand}>
          <div className={styles.loginBrandTop}>
            <div className={styles.loginBrandMark}>ST</div>
            <h2 className={styles.loginBrandHeadline}>
              Ghana&apos;s transport<br /><em>safety platform</em>
            </h2>
            <p className={styles.loginBrandDesc}>
              Real-time fleet monitoring, violation tracking, and driver management — all in one place.
            </p>
          </div>
          <div className={styles.loginBrandFeatures}>
            {[
              "Live trip monitoring across all organisations",
              "Automated speed violation detection",
              "Driver consent and compliance tracking",
              "Authority-facing audit and reporting",
            ].map((f) => (
              <div key={f} className={styles.loginBrandFeature}>
                <span className={styles.loginBrandFeatureDot} />
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* ── Right form panel ── */}
        <div className={styles.loginPanel}>
          <div className={styles.loginPanelInner}>
            <div className={styles.loginPanelHeader}>
              <p className={styles.eyebrow}>Operations portal</p>
              <h1 className={styles.loginPanelTitle}>Welcome back</h1>
              <p className={styles.loginPanelSub}>Sign in to your SmarTrans account</p>
            </div>

            <form className={styles.loginForm} onSubmit={handleLogin}>
              <label>
                <span>Email or phone</span>
                <input
                  placeholder="admin@smartrans.local"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
              </label>
              <label>
                <span>Password</span>
                <div className={styles.passwordWrap}>
                  <input
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "🙈" : "👁"}
                  </button>
                </div>
              </label>
              {error && <p className={styles.errorText}>{error}</p>}
              <button disabled={isLoading} type="submit">
                {isLoading ? "Signing in…" : "Sign in →"}
              </button>
            </form>

            <div className={styles.quickLogin}>
              <p className={styles.quickLoginLabel}>Quick login — dev only</p>
              <div className={styles.quickLoginChips}>
                {[
                  { name: "System Admin", email: "admin@smartrans.local", role: "Super Admin" },
                ].map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    className={styles.quickChip}
                    onClick={() => { setIdentifier(u.email); setPassword("SmarTrans@12345"); }}
                  >
                    <div className={styles.quickChipAvatar}>{u.name[0]}</div>
                    <div className={styles.quickChipInfo}>
                      <span className={styles.quickChipName}>{u.name}</span>
                      <span className={styles.quickChipRole}>{u.role}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const shellClassName = [
    styles.shell,
    sidebarCollapsed ? styles.shellCollapsed : "",
    sidebarOpen ? styles.shellNavOpen : "",
  ].filter(Boolean).join(" ");

  return (
    <main className={shellClassName}>
      <aside className={styles.sidebar} aria-label="SmarTrans navigation">
        <div className={styles.brand}>
          <div className={styles.brandMark}>ST</div>
          <div className={styles.brandText}>
            <strong>SmarTrans</strong>
            <span>Connect</span>
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

        <div className={styles.sidebarDivider} />

        <nav className={styles.nav} aria-label="Main navigation">
          {(["main", "manage", "monitor", "reports"] as const).map((group) => {
            const items = sections.filter((s) => s.group === group);
            const groupLabel: Record<string, string> = {
              main: "Dashboard", manage: "Management",
              monitor: "Monitoring", reports: "Reports",
            };
            return (
              <div key={group} className={styles.navGroup}>
                <p className={styles.navGroupLabel}>{groupLabel[group]}</p>
                {items.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={activeSection === section.id ? styles.navActive : styles.navItem}
                    onClick={() => {
                      setActiveSection(section.id);
                      setSidebarOpen(false);
                    }}
                    aria-current={activeSection === section.id ? "page" : undefined}
                  >
                    <span className={styles.navIcon} aria-hidden="true">{section.icon}</span>
                    <span className={styles.navLabel}>{section.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.sidebarUser}>
            <div className={styles.sidebarAvatar}>
              {(user?.fullName?.[0] ?? "S").toUpperCase()}
            </div>
            <div className={styles.sidebarUserInfo}>
              <p className={styles.sidebarUserName}>{user?.fullName}</p>
              <p className={styles.sidebarUserRole}>{humanize(user?.role ?? "")}</p>
            </div>
            <button
              type="button"
              className={styles.sidebarSignOut}
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              ⎋
            </button>
          </div>
        </div>
      </aside>

      <button
        type="button"
        className={styles.sidebarBackdrop}
        onClick={() => setSidebarOpen(false)}
        aria-label="Close navigation"
      />

      <section className={styles.workspace}>
        <div className={styles.mobileTopbar}>
          <button
            type="button"
            className={styles.mobileMenuButton}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            ☰
          </button>
          <span>Operations</span>
        </div>

        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Operations dashboard</p>
            <h1>{sections.find((section) => section.id === activeSection)?.label}</h1>
            {user && (
              <p className={styles.userLine}>
                Signed in as <strong>{user.fullName}</strong> · {humanize(user.role)}
              </p>
            )}
          </div>
          <div className={styles.headerActions}>
            <input
              aria-label="Search dashboard"
              className={styles.searchInput}
              placeholder="Search…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="button" onClick={() => loadDashboard(token)} disabled={isLoading}>
              {isLoading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>
        </header>

        {error && <p className={styles.errorText}>{error}</p>}
        {notice && <p className={styles.noticeText}>{notice}</p>}

        {activeSection === "overview" && (
          <>
            <section className={styles.metrics} aria-label="Operational metrics">
              {metrics.map((metric) => (
                <article className={styles.metricCard} key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.trend}</small>
                </article>
              ))}
            </section>

            <section className={styles.mainGrid}>
              <article className={styles.mapPanel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.eyebrow}>Live trip monitor</p>
                    <h2>Accra station routes</h2>
                  </div>
                  <span className={styles.statusPill}>{data.summary.activeTrips} live</span>
                </div>
                <div className={styles.routeMap} aria-label="Route activity visualization">
                  <span className={styles.roadOne} />
                  <span className={styles.roadTwo} />
                  <span className={styles.roadThree} />
                  <span className={styles.vehicleOne} />
                  <span className={styles.vehicleTwo} />
                  <span className={styles.vehicleThree} />
                </div>
                <div className={styles.tripStrip}>
                  {data.trips.slice(0, 3).map((trip) => (
                    <span key={trip.id}>
                      {trip.vehicle?.registrationNumber ?? "Vehicle"} · {humanize(trip.status)}
                    </span>
                  ))}
                  {data.trips.length === 0 && <span>No trips recorded</span>}
                </div>
              </article>

              <article className={styles.queuePanel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.eyebrow}>Action queue</p>
                    <h2>Needs review</h2>
                  </div>
                </div>
                <ul className={styles.queueList}>
                  {workQueue.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </section>
          </>
        )}

        {activeSection === "organizations" && (
          <section className={styles.managementGrid}>
            <form className={styles.formPanel} onSubmit={handleCreateOrganization}>
              <div>
                <p className={styles.eyebrow}>Staff action</p>
                <h2>Onboard organisation</h2>
              </div>
              <div className={styles.formGrid}>
                {[
                  { key: "name",          label: "Name",          type: "text",     required: true  },
                  { key: "contactPerson", label: "Contact person", type: "text",    required: false },
                  { key: "phone",         label: "Phone",          type: "text",    required: false },
                  { key: "email",         label: "Email",          type: "email",   required: false },
                ].map(({ key, label, type, required }) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      type={type}
                      required={required}
                      placeholder={key === "name" ? "Metro Mass Transit" : undefined}
                      value={(organizationForm as Record<string, string>)[key]}
                      onChange={(e) => setOrganizationForm({ ...organizationForm, [key]: e.target.value })}
                    />
                  </label>
                ))}
                <label>
                  <span>Type</span>
                  <select value={organizationForm.type} onChange={(e) => setOrganizationForm({ ...organizationForm, type: e.target.value })}>
                    <option value="STATION">Station</option>
                    <option value="UNION">Union</option>
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select value={organizationForm.status} onChange={(e) => setOrganizationForm({ ...organizationForm, status: e.target.value })}>
                    <option value="ACTIVE">Active</option>
                    <option value="PENDING">Pending</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </label>
                <label className={styles.fullField}>
                  <span>Address</span>
                  <input
                    value={organizationForm.address}
                    onChange={(e) => setOrganizationForm({ ...organizationForm, address: e.target.value })}
                  />
                </label>
                <label>
                  <span>Admin name</span>
                  <input
                    value={organizationForm.adminFullName}
                    onChange={(e) => setOrganizationForm({ ...organizationForm, adminFullName: e.target.value })}
                  />
                </label>
                <label>
                  <span>Admin email</span>
                  <input type="email" value={organizationForm.adminEmail} onChange={(e) => setOrganizationForm({ ...organizationForm, adminEmail: e.target.value })} />
                </label>
                <label>
                  <span>Admin phone</span>
                  <input value={organizationForm.adminPhone} onChange={(e) => setOrganizationForm({ ...organizationForm, adminPhone: e.target.value })} />
                </label>
                <label>
                  <span>Admin password</span>
                  <input type="password" placeholder={DEFAULT_ORG_STAFF_PASSWORD} value={organizationForm.adminPassword} onChange={(e) => setOrganizationForm({ ...organizationForm, adminPassword: e.target.value })} />
                </label>
              </div>
              <button className={styles.primaryAction} disabled={isSubmitting} type="submit">
                {isSubmitting ? "Creating…" : "Create organisation"}
              </button>
            </form>

            <article className={styles.tablePanel}>
              <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                <h2>Organisations ({filteredOrganizations.length})</h2>
              </div>
              <DataTable
                columns={["Organisation", "Type", "Status", "Drivers", "Vehicles"]}
                rows={filteredOrganizations.map((organization) => [
                  organization.name,
                  humanize(organization.type),
                  <StatusPill key="status" value={organization.status} />,
                  organization._count?.drivers ?? 0,
                  organization._count?.vehicles ?? 0,
                  <InlineActions
                    key="actions"
                    actions={[
                      {
                        label: organization.status === "ACTIVE" ? "Deactivate" : "Activate",
                        danger: organization.status === "ACTIVE",
                        onClick: () =>
                          updateWithRefresh(
                            `/organizations/${organization.id}`,
                            { status: organization.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
                            "Organisation status updated.",
                          ),
                      },
                    ]}
                  />,
                ])}
                empty="No organisations found"
                trailingColumn="Actions"
              />
            </article>
          </section>
        )}

        {activeSection === "authorities" && (
          <section className={styles.managementGrid}>
            <form className={styles.formPanel} onSubmit={handleCreateAuthority}>
              <div>
                <p className={styles.eyebrow}>System admin action</p>
                <h2>Onboard authority or regulator</h2>
              </div>
              <div className={styles.formGrid}>
                {[
                  { key: "name",          label: "Name",           type: "text",   required: true  },
                  { key: "contactPerson", label: "Contact person", type: "text",   required: false },
                  { key: "phone",         label: "Phone",          type: "text",   required: false },
                  { key: "email",         label: "Email",          type: "email",  required: false },
                ].map(({ key, label, type, required }) => (
                  <label key={key}>
                    <span>{label}</span>
                    <input
                      type={type}
                      required={required}
                      placeholder={key === "name" ? "National Road Safety Authority" : undefined}
                      value={(authorityForm as Record<string, string>)[key]}
                      onChange={(e) => setAuthorityForm({ ...authorityForm, [key]: e.target.value })}
                    />
                  </label>
                ))}
                <label>
                  <span>Type</span>
                  <select value={authorityForm.type} onChange={(e) => setAuthorityForm({ ...authorityForm, type: e.target.value })}>
                    <option value="REGULATOR">Regulator</option>
                    <option value="AUTHORITY">Authority</option>
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select value={authorityForm.status} onChange={(e) => setAuthorityForm({ ...authorityForm, status: e.target.value })}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </label>
                <label className={styles.fullField}>
                  <span>Address</span>
                  <input
                    value={authorityForm.address}
                    onChange={(e) => setAuthorityForm({ ...authorityForm, address: e.target.value })}
                  />
                </label>
                <label>
                  <span>Admin name</span>
                  <input
                    required
                    value={authorityForm.adminFullName}
                    onChange={(e) => setAuthorityForm({ ...authorityForm, adminFullName: e.target.value })}
                  />
                </label>
                <label>
                  <span>Admin email</span>
                  <input
                    required
                    type="email"
                    value={authorityForm.adminEmail}
                    onChange={(e) => setAuthorityForm({ ...authorityForm, adminEmail: e.target.value })}
                  />
                </label>
                <label>
                  <span>Admin phone</span>
                  <input value={authorityForm.adminPhone} onChange={(e) => setAuthorityForm({ ...authorityForm, adminPhone: e.target.value })} />
                </label>
                <label>
                  <span>Admin password</span>
                  <input type="password" placeholder={DEFAULT_AUTHORITY_PASSWORD} value={authorityForm.adminPassword} onChange={(e) => setAuthorityForm({ ...authorityForm, adminPassword: e.target.value })} />
                </label>
              </div>
              <button className={styles.primaryAction} disabled={isSubmitting} type="submit">
                {isSubmitting ? "Creating…" : "Create authority"}
              </button>
            </form>

            <div className={styles.managementStack}>
              <article className={styles.tablePanel}>
                <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                  <h2>Authorities ({filteredAuthorities.length})</h2>
                </div>
                <DataTable
                  columns={["Authority", "Type", "Status", "Users", "Contact"]}
                  rows={filteredAuthorities.map((authority) => [
                    authority.name,
                    humanize(authority.type),
                    <StatusPill key="status" value={authority.status} />,
                    authority._count?.authorityUsers ?? 0,
                    authority.email ?? authority.phone ?? "—",
                    <InlineActions
                      key="actions"
                      actions={[
                        {
                          label: authority.status === "ACTIVE" ? "Deactivate" : "Activate",
                          danger: authority.status === "ACTIVE",
                          onClick: () =>
                            updateWithRefresh(
                              `/authorities/${authority.id}`,
                              { status: authority.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
                              "Authority status updated.",
                            ),
                        },
                      ]}
                    />,
                  ])}
                  empty="No authorities found"
                  trailingColumn="Actions"
                />
              </article>

              <article className={styles.tablePanel}>
                <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                  <h2>Authority admins and users ({filteredAuthorityUsers.length})</h2>
                </div>
                <DataTable
                  columns={["User", "Authority", "Role", "Status", "Contact"]}
                  rows={filteredAuthorityUsers.map((authorityUser) => [
                    authorityUser.user.fullName,
                    authorityUser.authority.name,
                    <span key="role" className={authorityUser.role === "ADMIN" ? styles.chipGreen : styles.chipAmber}>
                      {humanize(authorityUser.role)}
                    </span>,
                    <StatusPill key="status" value={authorityUser.status} />,
                    authorityUser.user.email ?? authorityUser.user.phone ?? "—",
                  ])}
                  empty="No authority users found"
                />
              </article>
            </div>
          </section>
        )}

        {activeSection === "people" && (
          <section className={styles.managementGrid}>
            <div className={styles.managementStack}>
              <form className={styles.formPanel} onSubmit={handleCreateDriver}>
                <div>
                  <p className={styles.eyebrow}>Driver registry</p>
                  <h2>Add driver</h2>
                </div>
                <div className={styles.formGrid}>
                  <label>
                    <span>Organisation</span>
                    <select
                      required
                      value={driverForm.organizationId}
                      onChange={(e) => setDriverForm({ ...driverForm, organizationId: e.target.value })}
                    >
                      {data.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Full name</span>
                    <input
                      required
                      value={driverForm.fullName}
                      onChange={(e) => setDriverForm({ ...driverForm, fullName: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>License number</span>
                    <input
                      required
                      value={driverForm.licenseNumber}
                      onChange={(e) => setDriverForm({ ...driverForm, licenseNumber: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>National ID</span>
                    <input
                      value={driverForm.nationalId}
                      onChange={(e) => setDriverForm({ ...driverForm, nationalId: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={driverForm.email}
                      onChange={(e) => setDriverForm({ ...driverForm, email: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input
                      value={driverForm.phone}
                      onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Password</span>
                    <input
                      type="password"
                      value={driverForm.password}
                      onChange={(e) => setDriverForm({ ...driverForm, password: e.target.value })}
                    />
                  </label>
                  <label className={styles.checkboxField}>
                    <input
                      type="checkbox"
                      checked={driverForm.consentGiven}
                      onChange={(e) => setDriverForm({ ...driverForm, consentGiven: e.target.checked })}
                    />
                    Consent recorded
                  </label>
                </div>
                <button disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Saving..." : "Create driver"}
                </button>
              </form>

              <form className={styles.formPanel} onSubmit={handleCreateOwner}>
                <div>
                  <p className={styles.eyebrow}>Vehicle ownership</p>
                  <h2>Add owner</h2>
                </div>
                <div className={styles.formGrid}>
                  <label>
                    <span>Organisation</span>
                    <select
                      value={ownerForm.organizationId}
                      onChange={(e) => setOwnerForm({ ...ownerForm, organizationId: e.target.value })}
                    >
                      <option value="">No organisation</option>
                      {data.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Full name</span>
                    <input
                      required
                      value={ownerForm.fullName}
                      onChange={(e) => setOwnerForm({ ...ownerForm, fullName: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={ownerForm.email}
                      onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input
                      value={ownerForm.phone}
                      onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })}
                    />
                  </label>
                  <label className={styles.fullField}>
                    <span>Address</span>
                    <input
                      value={ownerForm.address}
                      onChange={(e) => setOwnerForm({ ...ownerForm, address: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Password</span>
                    <input
                      type="password"
                      value={ownerForm.password}
                      onChange={(e) => setOwnerForm({ ...ownerForm, password: e.target.value })}
                    />
                  </label>
                </div>
                <button disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Saving..." : "Create owner"}
                </button>
              </form>
            </div>

            <div className={styles.managementStack}>
              <article className={styles.tablePanel}>
                <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                  <h2>Drivers ({filteredDrivers.length})</h2>
                </div>
                <DataTable
                  columns={["Driver", "Organisation", "License", "Status", "Consent", "Contact"]}
                  rows={filteredDrivers.map((driver) => [
                    driver.user.fullName,
                    driver.organization.name,
                    driver.licenseNumber,
                    <StatusPill key="status" value={driver.status} />,
                    driver.consentGiven ? "Recorded" : "Pending",
                    driver.user.email ?? driver.user.phone ?? "—",
                  ])}
                  empty="No drivers found"
                />
              </article>

              <article className={styles.tablePanel}>
                <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                  <h2>Owners ({filteredOwners.length})</h2>
                </div>
                <DataTable
                  columns={["Owner", "Contact", "Vehicles", "Trips", "Violations"]}
                  rows={filteredOwners.map((owner) => [
                    owner.user.fullName,
                    owner.user.email ?? owner.user.phone ?? "—",
                    owner._count?.vehicles ?? 0,
                    owner._count?.trips ?? 0,
                    owner._count?.violations ?? 0,
                  ])}
                  empty="No owners found"
                />
              </article>
            </div>
          </section>
        )}

        {activeSection === "routes" && (
          <section className={styles.managementGrid}>
            <form className={styles.formPanel} onSubmit={handleCreateRouteTemplate}>
              <div>
                <p className={styles.eyebrow}>Station route setup</p>
                <h2>Add route template</h2>
              </div>
              <div className={styles.formGrid}>
                <label>
                  <span>Organisation</span>
                  <select
                    required
                    value={routeTemplateForm.organizationId}
                    onChange={(e) => setRouteTemplateForm({ ...routeTemplateForm, organizationId: e.target.value })}
                  >
                    {data.organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </label>
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
                    placeholder="80"
                    value={routeTemplateForm.speedLimit}
                    onChange={(e) => setRouteTemplateForm({ ...routeTemplateForm, speedLimit: e.target.value })}
                  />
                </label>
              </div>
              <button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Saving..." : "Create route template"}
              </button>
            </form>

            <article className={styles.tablePanel}>
              <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                <h2>Route templates ({filteredRouteTemplates.length})</h2>
              </div>
              <DataTable
                columns={["Route", "Organisation", "Origin", "Destination", "Distance", "Duration", "Limit", "Trips", "Status"]}
                rows={filteredRouteTemplates.map((routeTemplate) => [
                  routeTemplate.name,
                  routeTemplate.organization?.name ?? "—",
                  routeTemplate.origin,
                  routeTemplate.destination,
                  routeTemplate.estimatedDistanceKm
                    ? `${Math.round(routeTemplate.estimatedDistanceKm)} km`
                    : "—",
                  routeTemplate.estimatedDurationMinutes
                    ? `${routeTemplate.estimatedDurationMinutes} min`
                    : "—",
                  routeTemplate.speedLimit ? `${Math.round(routeTemplate.speedLimit)} km/h` : "Org default",
                  routeTemplate._count?.trips ?? 0,
                  <StatusPill key="status" value={routeTemplate.status} />,
                  <InlineActions
                    key="actions"
                    actions={[
                      {
                        label: routeTemplate.status === "ACTIVE" ? "Deactivate" : "Activate",
                        danger: routeTemplate.status === "ACTIVE",
                        onClick: () =>
                          updateWithRefresh(
                            `/route-templates/${routeTemplate.id}`,
                            { status: routeTemplate.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
                            "Route template status updated.",
                          ),
                      },
                    ]}
                  />,
                ])}
                empty="No route templates found"
                trailingColumn="Actions"
              />
            </article>
          </section>
        )}

        {activeSection === "fleet" && (
          <section className={styles.managementGrid}>
            <div className={styles.managementStack}>
              <form className={styles.formPanel} onSubmit={handleCreateVehicle}>
                <div>
                  <p className={styles.eyebrow}>Fleet registry</p>
                  <h2>Add vehicle</h2>
                </div>
                <div className={styles.formGrid}>
                  <label>
                    <span>Organisation</span>
                    <select
                      required
                      value={vehicleForm.organizationId}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, organizationId: e.target.value })}
                    >
                      {data.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Owner</span>
                    <select
                      required
                      value={vehicleForm.carOwnerId}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, carOwnerId: e.target.value })}
                    >
                      {data.owners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.user.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Registration</span>
                    <input
                      required
                      value={vehicleForm.registrationNumber}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, registrationNumber: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Vehicle type</span>
                    <input
                      required
                      value={vehicleForm.vehicleType}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>Make</span>
                    <input value={vehicleForm.make} onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })} />
                  </label>
                  <label>
                    <span>Model</span>
                    <input value={vehicleForm.model} onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })} />
                  </label>
                  <label>
                    <span>Color</span>
                    <input value={vehicleForm.color} onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })} />
                  </label>
                </div>
                <button disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Saving..." : "Create vehicle"}
                </button>
              </form>

              <form className={styles.formPanel} onSubmit={handleCreateAssignment}>
                <div>
                  <p className={styles.eyebrow}>Assignment</p>
                  <h2>Assign driver to vehicle</h2>
                </div>
                <div className={styles.formGrid}>
                  <label>
                    <span>Driver</span>
                    <select
                      required
                      value={assignmentForm.driverId}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, driverId: e.target.value })}
                    >
                      {data.drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.user.fullName} · {driver.licenseNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Vehicle</span>
                    <select
                      required
                      value={assignmentForm.vehicleId}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, vehicleId: e.target.value })}
                    >
                      {data.vehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.registrationNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Saving..." : "Assign vehicle"}
                </button>
              </form>
            </div>

            <div className={styles.managementStack}>
              <article className={styles.tablePanel}>
                <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                  <h2>Vehicles ({filteredVehicles.length})</h2>
                </div>
                <DataTable
                  columns={["Vehicle", "Type", "Organisation", "Owner", "Status"]}
                  rows={filteredVehicles.map((vehicle) => [
                    vehicle.registrationNumber,
                    vehicle.vehicleType,
                    vehicle.organization?.name ?? "—",
                    vehicle.carOwner?.user.fullName ?? "—",
                    <StatusPill key="status" value={vehicle.status} />,
                  ])}
                  empty="No vehicles found"
                />
              </article>

              <article className={styles.tablePanel}>
                <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                  <h2>Assignments ({filteredAssignments.length})</h2>
                </div>
                <DataTable
                  columns={["Driver", "Vehicle", "Assigned", "Status"]}
                  rows={filteredAssignments.map((assignment) => [
                    assignment.driver.user.fullName,
                    assignment.vehicle.registrationNumber,
                    formatDate(assignment.assignedAt),
                    assignment.isActive ? "Active" : "Inactive",
                    <InlineActions
                      key="actions"
                      actions={[
                        {
                          label: "Unassign",
                          danger: true,
                          onClick: () => deleteWithRefresh(`/assignments/${assignment.id}`, "Assignment removed."),
                        },
                      ]}
                    />,
                  ])}
                  empty="No assignments found"
                  trailingColumn="Actions"
                />
              </article>
            </div>
          </section>
        )}

        {activeSection === "trips" && (
          <section className={styles.tablePanel}>
            <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
              <h2>Trips ({filteredTrips.length})</h2>
            </div>
            <DataTable
              columns={["Driver", "Vehicle", "Route", "Organisation", "Status", "Started", "Ended", "Max speed", "Locations"]}
              rows={filteredTrips.map((trip) => [
                trip.driver?.user.fullName ?? "—",
                trip.vehicle?.registrationNumber ?? "—",
                trip.routeTemplate?.name ?? "—",
                trip.organization?.name ?? "—",
                <StatusPill key="status" value={trip.status} />,
                formatDate(trip.startTime),
                trip.endTime ? formatDate(trip.endTime) : "Open",
                trip.maxSpeed ? `${Math.round(trip.maxSpeed)} km/h` : "—",
                trip._count?.locations ?? 0,
              ])}
              empty="No trips found"
            />
          </section>
        )}

        {activeSection === "violations" && (
          <section className={styles.tablePanel}>
            <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
              <h2>Violations ({filteredViolations.length})</h2>
            </div>
            <DataTable
              columns={["Driver", "Vehicle", "Organisation", "Speed", "Limit", "Severity", "Type", "Time"]}
              rows={filteredViolations.map((violation) => [
                violation.driver?.user.fullName ?? "—",
                violation.vehicle?.registrationNumber ?? "—",
                violation.organization?.name ?? "—",
                `${Math.round(violation.speed)} km/h`,
                `${Math.round(violation.speedLimit)} km/h`,
                <span key="severity" className={styles.severity}>{humanize(violation.severity)}</span>,
                humanize(violation.violationType),
                formatDate(violation.violationTime),
              ])}
              empty="No violations found"
            />
          </section>
        )}

        {activeSection === "alerts" && (
          <section className={styles.tablePanel}>
            <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
              <h2>Alerts ({filteredAlerts.length})</h2>
            </div>
            <DataTable
              columns={["Type", "Message", "Channel", "Delivery", "Read", "Created"]}
              rows={filteredAlerts.map((alert) => [
                humanize(alert.alertType),
                alert.message,
                humanize(alert.deliveryChannel),
                <StatusPill key="delivery" value={alert.deliveryStatus} />,
                alert.isRead ? "Read" : "Unread",
                formatDate(alert.createdAt),
              ])}
              empty="No alerts found"
            />
          </section>
        )}

        {activeSection === "repeat-offenders" && (
          <section className={styles.tablePanel}>
            <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
              <h2>Repeat offenders ({filteredRepeatOffenders.length})</h2>
            </div>
            <DataTable
              columns={["Driver", "License", "Organisation", "Violations", "Last violation"]}
              rows={filteredRepeatOffenders.map((offender) => [
                offender.driver?.user.fullName ?? "—",
                offender.driver?.licenseNumber ?? "—",
                offender.driver?.organization.name ?? "—",
                offender.violationCount,
                formatDate(offender.lastViolationAt),
              ])}
              empty="No repeat offenders found"
            />
          </section>
        )}

        {activeSection === "reports" && (
          <section className={styles.managementStack}>
            <form className={styles.tablePanel} onSubmit={handleApplyReportFilters}>
              <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                <div>
                  <p className={styles.eyebrow}>Violation reporting</p>
                  <h2>Filter and export</h2>
                </div>
                <button className={styles.primaryAction} disabled={isSubmitting} type="button" onClick={handleExportViolations}>
                  {isSubmitting ? "Exporting..." : "Export CSV"}
                </button>
              </div>
              <div className={styles.filterGrid}>
                <label>
                  Organisation
                  <select
                    value={reportFilters.organizationId}
                    onChange={(e) => setReportFilters({ ...reportFilters, organizationId: e.target.value })}
                  >
                    <option value="">All organisations</option>
                    {data.organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Driver
                  <select
                    value={reportFilters.driverId}
                    onChange={(e) => setReportFilters({ ...reportFilters, driverId: e.target.value })}
                  >
                    <option value="">All drivers</option>
                    {data.drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.user.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Vehicle
                  <select
                    value={reportFilters.vehicleId}
                    onChange={(e) => setReportFilters({ ...reportFilters, vehicleId: e.target.value })}
                  >
                    <option value="">All vehicles</option>
                    {data.vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.registrationNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Severity
                  <select
                    value={reportFilters.severity}
                    onChange={(e) => setReportFilters({ ...reportFilters, severity: e.target.value })}
                  >
                    <option value="">All severities</option>
                    {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((severity) => (
                      <option key={severity} value={severity}>
                        {humanize(severity)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start date
                  <input
                    type="date"
                    value={reportFilters.startDate}
                    onChange={(e) => setReportFilters({ ...reportFilters, startDate: e.target.value })}
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    value={reportFilters.endDate}
                    onChange={(e) => setReportFilters({ ...reportFilters, endDate: e.target.value })}
                  />
                </label>
                <div className={styles.filterActions}>
                  <button type="submit">Apply</button>
                  <button type="button" onClick={handleClearReportFilters}>Clear</button>
                </div>
              </div>
            </form>

            <article className={styles.tablePanel}>
              <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                <h2>Report results ({reportFilteredViolations.length})</h2>
              </div>
              <DataTable
                columns={["Driver", "Vehicle", "Organisation", "Speed", "Severity", "Time"]}
                rows={pagedReportViolations.map((violation) => [
                  violation.driver?.user.fullName ?? "—",
                  violation.vehicle?.registrationNumber ?? "—",
                  violation.organization?.name ?? "—",
                  `${Math.round(violation.speed)} km/h`,
                  humanize(violation.severity),
                  formatDate(violation.violationTime),
                ])}
                empty="No report rows found"
              />
            </article>
          </section>
        )}

        {activeSection === "audit" && (
          <section className={styles.tablePanel}>
            <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
              <h2>Audit logs ({filteredAuditLogs.length})</h2>
              <div className={styles.filterActions}>
                <button
                  type="button"
                  disabled={auditPage <= 1}
                  onClick={() => setAuditPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={auditPage * PAGE_SIZE >= filteredAuditLogs.length}
                  onClick={() => setAuditPage((page) => page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
            <DataTable
              columns={["User", "Action", "Entity", "Entity ID", "Created"]}
              rows={pagedAuditLogs.map((log) => [
                log.user?.fullName ?? "System",
                log.action,
                log.entityType,
                log.entityId ?? "—",
                formatDate(log.createdAt),
              ])}
              empty="No audit logs found"
            />
          </section>
        )}

      </section>
    </main>
  );
}

function StatusPill({ value }: { value: string }) {
  return <span className={styles.statusPill}>{humanize(value)}</span>;
}

function DataTable({
  columns,
  rows,
  empty,
  trailingColumn,
}: {
  columns: string[];
  rows: Array<Array<ReactNode>>;
  empty: string;
  trailingColumn?: string;
}) {
  const renderedColumns = trailingColumn ? [...columns, trailingColumn] : columns;

  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            {renderedColumns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={renderedColumns.length}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function InlineActions({
  actions,
}: {
  actions: Array<{
    label: string;
    danger?: boolean;
    onClick: () => void;
  }>;
}) {
  return (
    <div className={styles.inlineActions}>
      {actions.map((action) => (
        <button
          className={action.danger ? styles.inlineDanger : styles.inlineButton}
          key={action.label}
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
