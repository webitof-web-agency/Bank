import { getImageUrl } from '../api/api';

export const DEFAULT_BRANDING = {
  appName: 'Bank',
  bankName: 'Bank',
  logoUrl: '',
  logoText: 'Bank',
  tagline: 'Employee portal',
  primaryColor: '#1661F6',
  accentColor: '#1661F6',
  sidebarBg: '#090d16',
  borderRadius: {
    card: '1.75rem',
    button: '1rem',
    input: '0.75rem'
  }
};

function isHexColor(value) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim());
}

export function extractBranding(settings = {}) {
  const branding = settings?.payload?.branding || {};
  return {
    ...DEFAULT_BRANDING,
    ...branding,
    appName: String(branding.appName || settings.appName || DEFAULT_BRANDING.appName).trim() || DEFAULT_BRANDING.appName,
    bankName: String(branding.bankName || settings.appName || DEFAULT_BRANDING.bankName).trim() || DEFAULT_BRANDING.bankName,
    logoUrl: String(branding.logoUrl || DEFAULT_BRANDING.logoUrl).trim() || DEFAULT_BRANDING.logoUrl,
    logoText: String(branding.logoText || branding.bankName || settings.appName || DEFAULT_BRANDING.logoText).trim() || DEFAULT_BRANDING.logoText,
    tagline: String(branding.tagline || DEFAULT_BRANDING.tagline).trim() || DEFAULT_BRANDING.tagline,
    primaryColor: isHexColor(branding.primaryColor) ? branding.primaryColor : DEFAULT_BRANDING.primaryColor,
    accentColor: isHexColor(branding.accentColor) ? branding.accentColor : DEFAULT_BRANDING.accentColor,
    sidebarBg: String(branding.sidebarBg || DEFAULT_BRANDING.sidebarBg).trim() || DEFAULT_BRANDING.sidebarBg,
    faviconUrl: String(branding.faviconUrl || '').trim(),
    sidebarExpandedUrl: String(branding.sidebarExpandedUrl || '').trim(),
    sidebarCollapsedUrl: String(branding.sidebarCollapsedUrl || '').trim(),
    borderRadius: {
      card: branding.borderRadius?.card || DEFAULT_BRANDING.borderRadius.card,
      button: branding.borderRadius?.button || DEFAULT_BRANDING.borderRadius.button,
      input: branding.borderRadius?.input || DEFAULT_BRANDING.borderRadius.input
    }
  };
}

export function applyBranding(branding = DEFAULT_BRANDING) {
  if (typeof document === 'undefined') return;

  try {
    localStorage.setItem('bank_branding_cache', JSON.stringify(branding));
  } catch (e) {}

  const root = document.documentElement;
  const primary = branding.primaryColor || DEFAULT_BRANDING.primaryColor;
  const accent = branding.accentColor || DEFAULT_BRANDING.accentColor;
  const sidebarBg = branding.sidebarBg || DEFAULT_BRANDING.sidebarBg;
  const radiuses = branding.borderRadius || DEFAULT_BRANDING.borderRadius;

  root.style.setProperty('--primary', primary);
  root.style.setProperty('--secondary', accent);
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--brand-gradient', `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`);
  root.style.setProperty('--brand-sidebar-bg', sidebarBg);
  root.style.setProperty('--brand-sidebar-active', `color-mix(in srgb, ${primary} 18%, transparent)`);
  root.style.setProperty('--brand-sidebar-hover', 'rgba(255, 255, 255, 0.05)');
  root.style.setProperty('--brand-sidebar-text', '#f8fafc');
  root.style.setProperty('--brand-sidebar-muted', '#94a3b8');
  root.style.setProperty('--brand-sidebar-border', 'rgba(255, 255, 255, 0.08)');
  
  root.style.setProperty('--radius-card', radiuses.card);
  root.style.setProperty('--radius-button', radiuses.button);
  root.style.setProperty('--radius-input', radiuses.input);

  if (branding.faviconUrl) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = getImageUrl(branding.faviconUrl);
  }
}
