import { DOMParser as XmlParser } from '@xmldom/xmldom';
import { beforeAll, expect, it } from 'vitest';
import { importGpx } from './gpx';
import { createGpx } from './routing';

beforeAll(() => { globalThis.DOMParser = XmlParser as unknown as typeof DOMParser; });
it('importe la trace complète, ses altitudes et son nom, puis les exporte', () => {
  const imported = importGpx('<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Montée</name><trkseg><trkpt lat="45" lon="6"><ele>100</ele></trkpt><trkpt lat="45.001" lon="6.001"><ele>105</ele></trkpt><trkpt lat="45.002" lon="6"><ele>110</ele></trkpt></trkseg></trk></gpx>', 'fichier');
  expect(imported.name).toBe('Montée');
  expect(imported.route.coordinates).toHaveLength(3);
  expect(imported.route.legAscents?.reduce<number>((a, b) => a + (b ?? 0), 0)).toBe(10);
  expect(createGpx(imported.route, 'Autre nom')).toContain('<ele>105</ele>');
  expect(createGpx(imported.route, 'Autre nom')).toContain('<name>Autre nom</name>');
});
it('accepte les itinéraires GPX et refuse les coordonnées invalides', () => {
  expect(importGpx('<gpx><rte><rtept lat="45" lon="6"/><rtept lat="46" lon="7"/></rte></gpx>', 'nom').points).toHaveLength(2);
  expect(() => importGpx('<gpx><trk><trkseg><trkpt lat="45" lon="6"/></trkseg></trk></gpx>', 'nom')).toThrow('au moins deux');
  expect(() => importGpx('<gpx><rte><rtept lat="" lon="6"/><rtept lat="46" lon="7"/></rte></gpx>', 'nom')).toThrow('coordonnées');
});
it('importe plusieurs segments comme étapes indépendantes sans inventer de liaison', () => {
  const xml = '<gpx><trk><trkseg><trkpt lat="45" lon="6"/><trkpt lat="45.1" lon="6.1"/></trkseg><trkseg><trkpt lat="46" lon="7"/><trkpt lat="46.1" lon="7.1"/></trkseg></trk></gpx>';
  const imported = importGpx(xml, 'Étapes');
  expect(imported.boundaries).toEqual([imported.points[1].id]);
  expect(imported.points[2].startsNewStage).toBe(true);
  expect(imported.route.legs[1]).toEqual([]);
  const exported = createGpx(imported.route, imported.name);
  expect(exported.match(/<trkseg>/g)).toHaveLength(2);
  expect(importGpx(exported, 'Étapes').route.coordinates).toEqual(imported.route.coordinates);
});
