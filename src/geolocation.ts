export type Platform = 'ios' | 'android' | 'mac' | 'desktop';
export type LocationHelp = { title: string; steps: string[]; blocked: boolean };

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh/.test(ua)) return 'mac';
  return 'desktop';
}

const BLOCKED_STEPS: Record<Platform, string[]> = {
  ios: ['Ouvrez Réglages › Confidentialité › Service de localisation et activez-le.', 'Touchez Safari, puis « Lors de l’utilisation ».'],
  android: ['Touchez le cadenas à côté de l’adresse du site.', 'Touchez Position › Autoriser.'],
  mac: ['Cliquez sur le cadenas à gauche de l’adresse du site.', 'Choisissez Position › Autoriser, puis rechargez la page.'],
  desktop: ['Cliquez sur le cadenas à gauche de l’adresse du site.', 'Choisissez Position › Autoriser, puis rechargez la page.'],
};

/** Aide simple selon l'erreur du navigateur (1 = refusée, 2 = introuvable, 3 = trop long, 0 = non disponible). */
export function locationHelp(code: number | undefined, platform: Platform = detectPlatform()): LocationHelp {
  if (code === 0) return { blocked: false, title: 'Votre position n’est pas disponible ici.', steps: ['Tapez une adresse à la place.'] };
  if (code === 2) return { blocked: false, title: 'Position introuvable.', steps: ['Activez le GPS ou le Wi‑Fi de votre appareil, puis réessayez.'] };
  if (code === 3) return { blocked: false, title: 'La position met trop de temps à arriver.', steps: ['Réessayez, ou tapez une adresse.'] };
  return { blocked: true, title: 'Votre position est bloquée. Pour l’activer :', steps: BLOCKED_STEPS[platform] };
}
/** Version courte, sur une seule ligne, pour les bandeaux d'erreur. */
export function locationSentence(code: number | undefined, platform: Platform = detectPlatform()): string {
  const help = locationHelp(code, platform);
  return `${help.title} ${help.steps.join(' ')}`;
}
