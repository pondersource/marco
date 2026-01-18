import Service from '@ember/service';

export default class OsmService extends Service {
  controller = null;

  async getNearbyPois(lat, lon, radius = 50) {
    // Cancel previous request if it exists
    if (this.controller) {
      this.controller.abort();
    }
    this.controller = new AbortController();
    const signal = this.controller.signal;

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

    try {
      const res = await this.fetchWithRetry(url, { signal });
      if (!res.ok) throw new Error('Overpass request failed');
      const data = await res.json();
      return data.elements;
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('Overpass request aborted');
        return [];
      }
      throw e;
    }
  }

  async fetchWithRetry(url, options = {}, retries = 1) {
    try {
      return await fetch(url, options);
    } catch (e) {
      if (retries > 0 && e.name !== 'AbortError') {
        console.log(`Retrying Overpass request... (${retries} left)`);
        await new Promise((r) => setTimeout(r, 1000));
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw e;
    }
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
    const res = await this.fetchWithRetry(url);
    if (!res.ok) throw new Error('Overpass request failed');
    const data = await res.json();
    return data.elements[0]; // Return the first match
  }
}
