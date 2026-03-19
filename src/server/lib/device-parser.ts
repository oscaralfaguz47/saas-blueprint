import "server-only";

export type ParsedDevice = {
  browser: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  displayName: string;
};

export function parseUserAgent(userAgent: string | null): ParsedDevice {
  if (!userAgent) {
    return {
      browser: "Unknown",
      os: "Unknown",
      deviceType: "unknown",
      displayName: "Unknown Device",
    };
  }

  const ua = userAgent.toLowerCase();

  // Device type
  const isMobile =
    /android(?!.*tablet)|iphone|ipod|blackberry|windows phone/.test(ua);
  const isTablet = /ipad|android.*tablet/.test(ua);
  const deviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  // OS
  let os = "Unknown";
  if (/windows nt 10/.test(ua)) os = "Windows 10/11";
  else if (/windows nt 6\.3/.test(ua)) os = "Windows 8.1";
  else if (/windows/.test(ua)) os = "Windows";
  else if (/mac os x/.test(ua)) {
    const match = ua.match(/mac os x (\d+[._]\d+)/);
    os = match ? `macOS ${match[1].replace("_", ".")}` : "macOS";
  } else if (/iphone/.test(ua)) {
    const match = ua.match(/os (\d+[._]\d+)/);
    os = match ? `iOS ${match[1].replace("_", ".")}` : "iOS";
  } else if (/ipad/.test(ua)) {
    const match = ua.match(/os (\d+[._]\d+)/);
    os = match ? `iPadOS ${match[1].replace("_", ".")}` : "iPadOS";
  } else if (/android/.test(ua)) {
    const match = ua.match(/android (\d+\.?\d*)/);
    os = match ? `Android ${match[1]}` : "Android";
  } else if (/linux/.test(ua)) os = "Linux";

  // Browser
  let browser = "Unknown";
  if (/edg\//.test(ua)) browser = "Edge";
  else if (/opr\/|opera/.test(ua)) browser = "Opera";
  else if (/chrome\//.test(ua) && !/chromium/.test(ua)) browser = "Chrome";
  else if (/safari\//.test(ua) && !/chrome/.test(ua)) browser = "Safari";
  else if (/firefox\//.test(ua)) browser = "Firefox";
  else if (/chromium/.test(ua)) browser = "Chromium";

  // Device icon hint
  const displayName = `${os} · ${browser}`;

  return { browser, os, deviceType, displayName };
}

