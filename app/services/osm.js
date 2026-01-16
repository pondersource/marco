import Service from '@ember/service';

export default class OsmService extends Service {
  async getNearbyPois(lat, lon, radius = 200) {
    const query = `
[out:json][timeout:25];
(
  nwr["amenity"](around:${radius},${lat},${lon});
  nwr["shop"](around:${radius},${lat},${lon});
  nwr["tourism"](around:${radius},${lat},${lon});
  nwr["leisure"](around:${radius},${lat},${lon});
  nwr["historic"](around:${radius},${lat},${lon});
);
out center;
    `.trim();

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Overpass request failed');
    const data = await res.json();
    return data.elements;
  }

  async getPoiById(id) {
    // Assuming 'id' is just the numeric ID.
    // Overpass needs type(id). But we might not know the type (node, way, relation).
    // We can query all types for this ID.
    // However, typical usage often passes just the numeric ID.
    // A query for just ID(numeric) is tricky without type.
    // Let's assume 'node' first or try to query all three types by ID.

    const query = `
[out:json][timeout:25];
(
  node(${id});
  way(${id});
  relation(${id});
);
out center;
    `.trim();

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Overpass request failed');
    const data = await res.json();
    return data.elements[0]; // Return the first match
  }
}
