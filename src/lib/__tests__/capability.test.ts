import { describe, it, expect } from "vitest";
import { detectIpmiCapability, formatCapabilityLine } from "../capability.js";

describe("detectIpmiCapability", () => {
  it("returns no_ipmitool_binary when neither device nor binary exist (Pi)", async () => {
    const cap = await detectIpmiCapability({
      statDevice: async () => "enoent",
      runIpmitool: async () => { const e: any = new Error("not found"); e.code = "ENOENT"; throw e; },
    });
    expect(cap).toEqual({ available: false, reason: "no_ipmitool_binary" });
  });

  it("returns available when /dev/ipmi0 exists and ipmitool runs", async () => {
    const cap = await detectIpmiCapability({
      statDevice: async (p) => p === "/dev/ipmi0" ? "ok" : "enoent",
      runIpmitool: async () => ({ stdout: "ipmitool version 1.8.18\n", stderr: "" }),
    });
    expect(cap).toEqual({ available: true, method: "ipmitool_in_band", ipmitool_version: "1.8.18" });
  });

  it("returns no_bmc_device when ipmitool exists but device is missing AND sensor probe fails", async () => {
    const cap = await detectIpmiCapability({
      statDevice: async () => "enoent",
      runIpmitool: async (args) => {
        if (args[0] === "-V") return { stdout: "ipmitool version 1.8.18", stderr: "" };
        const e: any = new Error("Could not open device");
        e.stderr = "Could not open device at /dev/ipmi0: No such file or directory";
        throw e;
      },
    });
    expect(cap.available).toBe(false);
    if (!cap.available) expect(cap.reason).toBe("no_bmc_device");
  });

  it("returns permission_denied on EACCES", async () => {
    const cap = await detectIpmiCapability({
      statDevice: async () => "eacces",
      runIpmitool: async () => ({ stdout: "ipmitool version 1.8.18", stderr: "" }),
    });
    expect(cap.available).toBe(false);
    if (!cap.available) {
      expect(cap.reason).toBe("permission_denied");
      expect(cap.detail).toContain("ipmi");
    }
  });

  it("VM with ipmitool installed but no virtual BMC: no_bmc_device", async () => {
    const cap = await detectIpmiCapability({
      statDevice: async () => "enoent",
      runIpmitool: async (args) => {
        if (args[0] === "-V") return { stdout: "ipmitool version 1.8.19", stderr: "" };
        const e: any = new Error("could not open");
        e.stderr = "Could not open device";
        throw e;
      },
    });
    expect(cap.available).toBe(false);
    if (!cap.available) expect(cap.reason).toBe("no_bmc_device");
  });

  it("captures ipmitool version when present", async () => {
    const cap = await detectIpmiCapability({
      statDevice: async (p) => p === "/dev/ipmi0" ? "ok" : "enoent",
      runIpmitool: async () => ({ stdout: "ipmitool version 1.8.21-rc1\n", stderr: "" }),
    });
    expect(cap.available).toBe(true);
    if (cap.available) expect(cap.ipmitool_version).toBe("1.8.21-rc1");
  });
});

describe("formatCapabilityLine", () => {
  it("formats available capability", () => {
    expect(formatCapabilityLine({ available: true, method: "ipmitool_in_band", ipmitool_version: "1.8.18" }))
      .toBe("IPMI: available (ipmitool 1.8.18, ipmitool in band)");
  });
  it("formats no ipmitool", () => {
    expect(formatCapabilityLine({ available: false, reason: "no_ipmitool_binary" }))
      .toBe("IPMI: not available (ipmitool not installed)");
  });
  it("formats no BMC", () => {
    expect(formatCapabilityLine({ available: false, reason: "no_bmc_device" }))
      .toBe("IPMI: not available (no /dev/ipmi*, BMC not detected)");
  });
  it("formats permission denied", () => {
    expect(formatCapabilityLine({ available: false, reason: "permission_denied", detail: "/dev/ipmi0 not readable" }))
      .toBe("IPMI: not available (/dev/ipmi0 not readable)");
  });
});
