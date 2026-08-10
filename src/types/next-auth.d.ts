import type { DefaultSession } from "next-auth";

type TorqueFlowRole = "ADMIN" | "TECNICO" | "RECEPCION";

declare module "next-auth" {
  interface User {
    role: TorqueFlowRole;
    tenantSlug: string;
    tenantSchema: string;
  }

  interface Session {
    user: {
      id: string;
      role: TorqueFlowRole;
      tenantSlug: string;
      tenantSchema: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: TorqueFlowRole;
    tenantSlug?: string;
    tenantSchema?: string;
  }
}
