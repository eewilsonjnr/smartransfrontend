const normalizeApiBase = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/, "");
  const looksLikeDomain = /^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/|$)/i.test(withoutLeadingSlash);

  if (looksLikeDomain) {
    return `https://${withoutLeadingSlash}`;
  }

  return trimmed;
};

export const API_BASE = normalizeApiBase(
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api",
);

export async function apiRequest<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
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

export async function apiLogin(
  identifier: string,
  password: string,
): Promise<{ token: string; refreshToken: string; user: DashboardUser }> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "Login failed.");
  return { token: body.token, refreshToken: body.refreshToken, user: body.user };
}

export type DashboardUser = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  organizationIds?: string[];
  authorityIds?: string[];
  authorityUserRole?: "ADMIN" | "USER";
};

export const humanize = (value: string) => value.replaceAll("_", " ");
export const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: Pagination;
};

export type DashboardAlert = {
  id: string;
  alertType: string;
  message: string;
  deliveryStatus: string;
  deliveryChannel: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
};
