import { expect, it } from 'vitest';
import { locationHelp, locationSentence } from './geolocation';

it('explique en deux étapes comment débloquer la position selon l’appareil', () => {
  expect(locationHelp(1, 'ios').steps[0]).toContain('Service de localisation');
  expect(locationHelp(1, 'android').steps[1]).toContain('Autoriser');
  expect(locationHelp(1, 'mac').steps).toHaveLength(2);
  expect(locationHelp(1, 'desktop').blocked).toBe(true);
});
it('distingue refus, position introuvable, délai dépassé et non disponible', () => {
  expect(locationHelp(2, 'desktop')).toMatchObject({ blocked: false, title: 'Position introuvable.' });
  expect(locationHelp(3, 'desktop').title).toContain('trop de temps');
  expect(locationHelp(0, 'desktop').steps[0]).toContain('adresse');
  expect(locationSentence(1, 'desktop')).toMatch(/bloquée.*Autoriser/);
});
