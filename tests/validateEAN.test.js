import { describe, expect, test } from "@jest/globals";
import { validateEAN } from "../src/utils/validateEAN.js";

describe("validateEAN", () => {
  test("aceita EAN valido", () => {
    expect(validateEAN("7891058009458").isValid).toBe(true);
  });

  test("rejeita EAN invalido", () => {
    expect(validateEAN("123").isValid).toBe(false);
  });
});
