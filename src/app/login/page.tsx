import { CalendarCheck2, ClipboardList, Warehouse, Wrench } from "lucide-react";
import { LoginForm } from "./login-form";
import { LoginErrorAlert } from "./login-error-alert";
import { getLoginErrorMessage } from "@/lib/auth/login-error-message";

const FEATURES = [
  { icon: ClipboardList, label: "Tablero de órdenes por estado" },
  { icon: CalendarCheck2, label: "Citas y recordatorios por vehículo" },
  { icon: Warehouse, label: "Inventario y cartera por sede" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = getLoginErrorMessage(rawError);

  return (
    <main className="flex min-h-svh flex-wrap bg-background">
      <div className="dark relative flex min-w-[min(100%,340px)] flex-1 basis-[420px] flex-col justify-between gap-8 overflow-hidden bg-sidebar p-8 text-sidebar-foreground sm:p-12">
        <div className="absolute -top-24 -right-24 size-72 rounded-full bg-primary/10" />
        <div className="absolute -bottom-16 -left-10 size-44 rounded-full bg-white/[0.03]" />

        <div className="relative flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Wrench className="size-4 text-primary-foreground" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">TorqueFlow</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[clamp(22px,3vw,31px)] leading-[1.18] font-semibold tracking-tight">
            El taller completo,
            <br />
            en una sola pantalla.
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-sidebar-foreground/70">
            Órdenes, citas, inventario y facturación de todas tus sedes, con el historial de cada vehículo siempre a
            mano.
          </p>
          <ul className="mt-6 flex flex-col gap-2.5">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-[12.5px] text-sidebar-foreground/85">
                <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary/20">
                  <Icon className="size-2.5 text-primary" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-[11px] text-sidebar-foreground/50">
          © {new Date().getFullYear()} TorqueFlow
        </div>
      </div>

      <div className="flex min-w-[min(100%,320px)] flex-1 basis-[460px] items-center justify-center p-6 sm:p-14">
        <div className="flex w-full max-w-[392px] flex-col gap-5">
          <div>
            <h1 className="font-heading text-2xl leading-snug font-semibold tracking-tight">Ingresar a TorqueFlow</h1>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">Ingresa tus credenciales para continuar</p>
          </div>

          {errorMessage ? <LoginErrorAlert message={errorMessage} /> : null}

          <LoginForm />
        </div>
      </div>
    </main>
  );
}
