import { useEffect } from "react";
import { useGetPublicHospitalSettings } from "@workspace/api-client-react";

function hexToHslTriple(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function useBranding() {
  const q = useGetPublicHospitalSettings();
  const settings = q.data;

  useEffect(() => {
    if (!settings) return;
    if (settings.name) document.title = settings.name;
    const hsl = settings.primaryColor ? hexToHslTriple(settings.primaryColor) : null;
    if (hsl) {
      document.documentElement.style.setProperty("--primary", hsl);
      document.documentElement.style.setProperty("--sidebar-primary", hsl);
      document.documentElement.style.setProperty("--ring", hsl);
    }
  }, [settings]);

  return settings;
}
