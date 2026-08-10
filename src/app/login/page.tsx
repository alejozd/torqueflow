import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main style={{ padding: "2rem", maxWidth: "24rem", margin: "0 auto" }}>
      <h1>Ingresar a TorqueFlow</h1>
      <LoginForm />
    </main>
  );
}
