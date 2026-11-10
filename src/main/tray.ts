export const TRAY_ASSETS = { image: 'tray-white.png', retina: 'tray-white@2x.png' } as const;
export const applicationIcon = (platform: string) => platform === 'darwin' ? 'icon-mac.png' : 'icon.png';
export const APP_ICON = applicationIcon(process.platform);
