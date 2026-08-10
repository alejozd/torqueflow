import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/guards";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <div style={{ padding: "2rem" }}>{children}</div>;
}
