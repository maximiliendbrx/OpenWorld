import { DOMParser as XmlParser } from '@xmldom/xmldom';
import { beforeAll, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseKmz, visitedPoints } from './kmz';
const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>CP1 - Col du Galibier</name><description><![CDATA[<b>Ouverture</b> 6h &amp; fermeture 22h]]></description><Point><coordinates>6.4078,45.0642,2642</coordinates></Point></Placemark>
<Folder><Placemark><name>CP2</name><Point><coordinates> 6.5,45.1 </coordinates></Point></Placemark></Folder>
<Placemark><name>Ligne</name><LineString><coordinates>6,45 6.1,45.1</coordinates></LineString></Placemark>
<Placemark><name>Hors limites</name><Point><coordinates>400,95</coordinates></Point></Placemark>
</Document></kml>`;
beforeAll(() => { globalThis.DOMParser = XmlParser as unknown as typeof DOMParser; });
let n = 0;
const id = () => `id${n++}`;
it('lit les points d’un KML (ignore lignes et coordonnées invalides)', () => {
  const points = parseKmz(strToU8(kml), id);
  expect(points).toHaveLength(2);
  expect(points[0]).toMatchObject({ name: 'CP1 - Col du Galibier', lat: 45.0642, lng: 6.4078 });
  expect(points[0].description).toBe('Ouverture 6h & fermeture 22h');
  expect(points[1]).toMatchObject({ name: 'CP2', lat: 45.1, lng: 6.5 });
});
it('lit un KMZ (archive ZIP) avec doc.kml', () => {
  const kmz = zipSync({ 'images/icon.png': new Uint8Array([1, 2, 3]), 'doc.kml': strToU8(kml) });
  expect(parseKmz(kmz, id)).toHaveLength(2);
});
it('refuse un fichier sans point, invalide ou DOCTYPE', () => {
  expect(() => parseKmz(strToU8('<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>'))).toThrow('Aucun point');
  expect(() => parseKmz(strToU8('pas du xml'))).toThrow('invalide');
  expect(() => parseKmz(strToU8('<!DOCTYPE kml []><kml/>'))).toThrow('non pris en charge');
  expect(() => parseKmz(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).toThrow('KMZ');
});
it('détecte les points déjà traversés par le tracé', () => {
  const points = parseKmz(strToU8(kml), id);
  const route: [number, number][] = [[45.0642, 6.4075], [45.0645, 6.41], [45.2, 6.8]];
  expect(visitedPoints(route, points)).toEqual([true, false]);
});
