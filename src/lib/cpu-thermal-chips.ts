// Allowlist of hwmon chip `name` values that report CPU die / package
// temperatures. Adding a new platform here is the supported way to teach
// the thermal collector that a chip's readings represent CPU temperature.
//
// Drivers explicitly excluded:
//   - "nvme"   already covered by SMART; double counts otherwise
//   - "acpitz" often reads ambient or chassis air, not CPU die. Goes to
//              other_readings if found, never to cpu_readings.
export const CPU_THERMAL_CHIPS: ReadonlySet<string> = new Set([
  // Intel x86
  "coretemp",
  // AMD x86 (modern)
  "k10temp",
  "zenpower",
  // ARM / SoC
  "cpu_thermal",      // Raspberry Pi 4/5, many ARM SBCs
  "armada_thermal",   // Marvell Armada SoCs
  "tegra_thermal",    // NVIDIA Tegra
  "qcom_tsens",       // Qualcomm
  "imx_thermal",      // NXP i.MX
  "sun4i_ts",         // Allwinner sunxi
  "rockchip_thermal", // Rockchip RK3399 etc.
  "exynos_thermal",   // Samsung Exynos
]);

export function isCpuChip(name: string): boolean {
  return CPU_THERMAL_CHIPS.has(name);
}
