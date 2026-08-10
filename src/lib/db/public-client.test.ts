import { afterEach, describe, expect, it } from "vitest";
import { publicDb } from "./public-client";

describe("publicDb (Tenant model, public schema)", () => {
  afterEach(async () => {
    await publicDb.tenant.deleteMany({ where: { slug: "test-task4-fixture" } });
  });

  it("creates and reads back a Tenant row", async () => {
    const created = await publicDb.tenant.create({
      data: { slug: "test-task4-fixture", schemaName: "test_task4_fixture" },
    });

    const found = await publicDb.tenant.findUnique({ where: { slug: "test-task4-fixture" } });

    expect(found?.id).toBe(created.id);
    expect(found?.schemaName).toBe("test_task4_fixture");
  });
});
