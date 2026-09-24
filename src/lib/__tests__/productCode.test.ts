import { describe, expect, it } from "vitest";
import {
  buildProductPrefix,
  displayProductCode,
  formatProductCode,
  nextProductCode,
} from "../productCode";

describe("buildProductPrefix", () => {
  it.each([
    ["ALV P", "ALVP"],
    ["H/L KEG", "HLKEG"],
    ["", "PRD"],
    [null, "PRD"],
    ["b & w", "BW"],
  ])("prefix(%p) = %s", (input, expected) => {
    expect(buildProductPrefix(input)).toBe(expected);
  });
});

describe("formatProductCode / nextProductCode", () => {
  it("pads to 3 digits", () => {
    expect(formatProductCode("ALVP", 1)).toBe("ALVP-001");
    expect(formatProductCode("ALVP", 42)).toBe("ALVP-042");
  });

  it("picks max+1 case-insensitively, ignores other prefixes and blanks", () => {
    expect(nextProductCode("ALVP", ["ALVP-001", "alvp-002", "HLKEG-009", null, undefined, "junk"])).toBe(
      "ALVP-003",
    );
  });

  it("starts at 001 when none taken", () => {
    expect(nextProductCode("PRD", [])).toBe("PRD-001");
  });
});

describe("displayProductCode", () => {
  it("prefers unique code, falls back to category, then N/A", () => {
    expect(displayProductCode({ product_code: "ALVP-001", code_name: "ALV P" })).toBe("ALVP-001");
    expect(displayProductCode({ code_name: "ALV P" })).toBe("ALV P");
    expect(displayProductCode({})).toBe("N/A");
  });
});
