import type { DefaultSession } from "next-auth";

type TorqueFlowRole = "ADMIN" | "TECNICO" | "RECEPCION";

declare module "next-auth" {
  interface User {
    role: TorqueFlowRole;
    tenantSlug: string;
    tenantSchema: string;
    /** The sede this session operates in. Chosen at login, validated in authorize(). */
    sedeActivaId: string;
    /** Display-only copy, so the dashboard header needs no query. */
    sedeActivaNombre: string;
  }

  interface Session {
    user: {
      id: string;
      role: TorqueFlowRole;
      tenantSlug: string;
      tenantSchema: string;
      sedeActivaId: string;
      sedeActivaNombre: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: TorqueFlowRole;
    tenantSlug?: string;
    tenantSchema?: string;
    sedeActivaId?: string;
    sedeActivaNombre?: string;
  }
}
