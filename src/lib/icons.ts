/** Shared lookups for the bundled flag-icons set and the OS icon pack. */

export function flagPath(country: string): string {
  return `/flags/${country.toLowerCase()}.svg`
}

// Exact filenames, since the pack has a few quirks (a .webp, two .png/.ico and
// one capital S). Matched against the node's reported os string.
const OS_FILES: [RegExp, string][] = [
  [/debian/i, "os-debian.svg"],
  [/ubuntu/i, "os-ubuntu.svg"],
  [/alma/i, "os-alma.svg"],
  [/rocky/i, "os-rocky.svg"],
  [/centos/i, "os-centos.svg"],
  [/alpine/i, "os-alpine.webp"],
  [/arch/i, "os-arch.svg"],
  [/fedora/i, "os-fedora.svg"],
  [/suse/i, "os-openSUSE.svg"],
  [/nix/i, "os-nix.svg"],
  [/mint/i, "os-mint.svg"],
  [/manjaro/i, "os-manjaro-.svg"],
  [/gentoo/i, "os-gentoo.svg"],
  [/oracle/i, "os-oracle.svg"],
  [/redhat|rhel/i, "os-redhat.svg"],
  [/windows/i, "os-windows.svg"],
  [/macos|darwin/i, "os-macos.svg"],
  [/armbian/i, "os-armbian.png"],
  [/openwrt/i, "os-openwrt.svg"],
  [/proxmox/i, "os-proxmox.ico"],
  [/alibaba|aliyun/i, "os-alibaba.svg"],
  [/kali|kail/i, "os-kail.svg"],
]

export function osIconPath(os: string): string | null {
  const hit = OS_FILES.find(([re]) => re.test(os))
  return hit ? `/os-icons/${hit[1]}` : null
}
