const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/**
 * The gate every tenant schema name must pass right before it is
 * interpolated into raw DDL ($executeRawUnsafe: CREATE/DROP SCHEMA) --
 * Postgres cannot bind an identifier as a query parameter. Kept as one
 * shared check and called at each DDL site, not only once upstream, so
 * removing an earlier validation can never turn into SQL injection.
 *
 * The message prefix "Invalid schema name" is matched by
 * ERRORES_PROVISIONAMIENTO_CONOCIDOS in super-admin-actions.ts.
 */
export function assertSafeSchemaName(schemaName: string): void {
  if (!SAFE_IDENTIFIER.test(schemaName)) {
    throw new Error(`Invalid schema name: "${schemaName}" (expected lowercase snake_case)`);
  }
}
