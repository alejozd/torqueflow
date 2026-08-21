import { LoginForm } from "./login-form";
import { getLoginErrorMessage } from "@/lib/auth/login-error-message";
import { listSedesDelTenant } from "@/lib/sede/login-sedes";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage = getLoginErrorMessage(rawError);
  const sedes = await listSedesDelTenant();

  return (
    <main style={{ padding: "2rem", maxWidth: "24rem", margin: "0 auto" }}>
      <h1>Ingresar a TorqueFlow</h1>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <LoginForm sedes={sedes} />
    </main>
  );
}
