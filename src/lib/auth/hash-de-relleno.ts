import bcrypt from "bcryptjs";

/**
 * bcrypt hash (cost 12, same as every real password hash in the app) of a
 * random value nobody knows. Comparing against it costs the same ~200ms as a
 * real password check and can never succeed.
 */
const HASH_DE_RELLENO = "$2b$12$ans3vOw5RQsqS/gYt9VPcecH0bivVJwQxSpxeErF6jHuU3IMfyjdy";

/**
 * Login failure paths that never reach a real bcrypt.compare (unknown email,
 * suspended taller) would otherwise answer in a few milliseconds, while a
 * wrong password for a real account takes ~200ms -- enough to enumerate which
 * emails are registered by timing alone. Every such path awaits this instead,
 * so all failures cost the same.
 */
export async function compararConHashDeRelleno(password: string): Promise<void> {
  await bcrypt.compare(password, HASH_DE_RELLENO);
}
