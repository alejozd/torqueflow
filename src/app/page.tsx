import { redirect } from "next/navigation";

// Fase 10: there is only one URL now (no per-tenant subdomain to land on),
// so the bare root has nothing of its own to show -- go straight to login.
export default function Home() {
  redirect("/login");
}
