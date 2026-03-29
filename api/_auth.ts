import { createClient, type User } from "@supabase/supabase-js";

export interface AdminRequestContext {
  token: string | null;
  user: User | null;
  email: string | null;
  isAdmin: boolean;
  status: number;
  error: string | null;
}

function getSupabaseAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export function getBearerToken(req: any) {
  const authorization = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authorization !== "string") return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function getAdminEmailAllowlist() {
  const raw = process.env.ADMIN_EMAIL_ALLOWLIST || "";
  return new Set(
    raw
      .split(/[,\n;]/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getAdminRequestContext(req: any): Promise<AdminRequestContext> {
  const token = getBearerToken(req);
  if (!token) {
    return {
      token: null,
      user: null,
      email: null,
      isAdmin: false,
      status: 401,
      error: "Missing bearer token",
    };
  }

  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.trim().toLowerCase() || null;

  if (error || !data.user || !email) {
    return {
      token,
      user: null,
      email: null,
      isAdmin: false,
      status: 401,
      error: error?.message || "Invalid session",
    };
  }

  const allowlist = getAdminEmailAllowlist();
  if (allowlist.size === 0) {
    return {
      token,
      user: data.user,
      email,
      isAdmin: false,
      status: 500,
      error: "ADMIN_EMAIL_ALLOWLIST is not configured",
    };
  }

  const isAdmin = allowlist.has(email);

  return {
    token,
    user: data.user,
    email,
    isAdmin,
    status: isAdmin ? 200 : 403,
    error: isAdmin ? null : "User is not authorized for admin access",
  };
}

export async function requireAdminRequest(req: any, res: any) {
  const context = await getAdminRequestContext(req);
  if (context.error || !context.isAdmin || !context.user) {
    res.status(context.status).json({
      error: context.error || "Unauthorized",
      authenticated: Boolean(context.user),
      isAdmin: false,
      email: context.email,
    });
    return null;
  }

  return context;
}
