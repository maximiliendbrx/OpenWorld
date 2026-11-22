import { DOMParser as XmlParser } from '@xmldom/xmldom';
import { beforeAll, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { collectionFromFile, collectionToKml, collectionToKmz, guessIcon, isCollection, isLibrary, readLibrary, splitLeadingEmoji, writeLibrary, type Collection } from './library';

beforeAll(() => { globalThis.DOMParser = XmlParser as unknown as typeof DOMParser; });
let n = 0;
const id = () => `i${n++}`;
const sample: Collection = { id: 'c1', name: 'Cols & vues <Alpes>', updatedAt: '2026-11-22T10:00:00Z', points: [
  { id: 'p1', name: 'Col du Galibier', description: 'Altitude 2642 m & vent', lat: 45.0642, lng: 6.4078, icon: '🏔️' },
  { id: 'p2', name: 'Belvédère', lat: 45.2, lng: 6.5, icon: '👀' },
] };

it('devine une icône d’après le nom', () => {
  expect(guessIcon('Col de la Croix de Fer')).toBe('🏔️');
  expect(guessIcon('Côte de Domancy')).toBe('⛰️');
  expect(guessIcon('Vue sur le lac')).toBe('👀');
  expect(guessIcon('Fontaine du village')).toBe('💧');
  expect(guessIcon('Boulangerie Paul')).toBe('🍽️');
  expect(guessIcon('Quelque chose')).toBe('📍');
});
it('sépare l’émoticône placée devant le nom', () => {
  expect(splitLeadingEmoji('⛰️ Col du Glandon')).toEqual({ icon: '⛰️', name: 'Col du Glandon' });
  expect(splitLeadingEmoji('🚵‍♂️ Single')).toMatchObject({ name: 'Single' });
  expect(splitLeadingEmoji('Col du Glandon')).toEqual({ name: 'Col du Glandon' });
});
it('exporte puis relit un KMZ sans perdre icônes, noms ni descriptions', () => {
  const kmz = collectionToKmz(sample);
  expect(strFromU8(unzipSync(kmz)['doc.kml'])).toContain('horizonsgpx_icon');
  const back = collectionFromFile(kmz, 'Cols_Alpes.kmz', id);
  expect(back.name).toBe('Cols Alpes');
  expect(back.points.map(p => [p.name, p.icon, p.description])).toEqual([['Col du Galibier', '🏔️', 'Altitude 2642 m & vent'], ['Belvédère', '👀', undefined]]);
  expect(back.points[0]).toMatchObject({ lat: 45.0642, lng: 6.4078 });
});
it('échappe le XML du nom de collection', () => { expect(collectionToKml(sample)).toContain('Cols &amp; vues &lt;Alpes&gt;'); });
it('importe un KML étranger en devinant les icônes', () => {
  const kml = '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Col d’Izoard</name><Point><coordinates>6.73,44.82</coordinates></Point></Placemark><Placemark><name>CP2</name><Point><coordinates>6.5,44.9</coordinates></Point></Placemark></Document></kml>';
  const c = collectionFromFile(new TextEncoder().encode(kml), 'course.kml', id);
  expect(c.points.map(p => p.icon)).toEqual(['🏔️', '🚩']);
});
it('valide et persiste la bibliothèque', () => {
  expect(isCollection(sample)).toBe(true);
  expect(isCollection({ ...sample, points: [{ ...sample.points[0], icon: '' }] })).toBe(false);
  expect(isCollection({ ...sample, points: [{ ...sample.points[0], lat: 200 }] })).toBe(false);
  expect(isLibrary([sample, sample])).toBe(false);
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } } as unknown as Storage;
  writeLibrary(storage, [sample]);
  expect(readLibrary(storage)).toEqual([sample]);
  writeLibrary(storage, []);
  expect(readLibrary(storage)).toEqual([]);
});
