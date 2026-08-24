import { afterEach, describe, expect, it } from "vitest";
import { publicDb } from "./public-client";

describe("publicDb (Tenant model, public schema)", () => {
  afterEach(async () => {
    await publicDb.tenant.deleteMany({ where: { slug: "test-task4-fixture" } });
  });

  it("creates and reads back a Tenant row", async () => {
    const planBasico = await publicDb.plan.findUniqueOrThrow({ where: { nombre: "Básico" } });
    const created = await publicDb.tenant.create({
      data: { slug: "test-task4-fixture", schemaName: "test_task4_fixture", planId: planBasico.id },
    });

    const found = await publicDb.tenant.findUnique({ where: { slug: "test-task4-fixture" } });

    expect(found?.id).toBe(created.id);
    expect(found?.schemaName).toBe("test_task4_fixture");
  });
});
