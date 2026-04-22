import { describe, it, expect } from "vitest";
import { readOsReleaseField } from "../system.js";

describe("readOsReleaseField", () => {
  it("parses unquoted Ubuntu values", () => {
    const s = 'NAME="Ubuntu"\nID=ubuntu\nID_LIKE=debian\nVERSION_ID="24.04"';
    expect(readOsReleaseField(s, "ID")).toBe("ubuntu");
    expect(readOsReleaseField(s, "ID_LIKE")).toBe("debian");
  });

  it("parses quoted RHEL-family values", () => {
    const s = 'NAME="Rocky Linux"\nID="rocky"\nID_LIKE="rhel centos fedora"';
    expect(readOsReleaseField(s, "ID")).toBe("rocky");
    expect(readOsReleaseField(s, "ID_LIKE")).toBe("rhel centos fedora");
  });

  it("lowercases the result (some distros uppercase their ID)", () => {
    expect(readOsReleaseField("ID=Alpine", "ID")).toBe("alpine");
  });

  it("returns undefined for a missing key", () => {
    expect(readOsReleaseField("ID=arch", "ID_LIKE")).toBeUndefined();
  });

  it("does not confuse ID with VERSION_ID", () => {
    const s = 'VERSION_ID="24.04"\nID=ubuntu';
    expect(readOsReleaseField(s, "ID")).toBe("ubuntu");
  });
});
