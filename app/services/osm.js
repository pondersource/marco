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
  nw["amenity"](around:${radius},${lat},${lon});
  nw["shop"](around:${radius},${lat},${lon});
  nw["tourism"](around:${radius},${lat},${lon});
  nw["leisure"](around:${radius},${lat},${lon});
  nw["historic"](around:${radius},${lat},${lon});
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

  async fetchWithRetry(url, options = {}, retries = 3) {
    try {
      const res = await fetch(url, options);

      if (!res.ok && retries > 0 && [502, 503, 504, 429].includes(res.status)) {
        console.log(
          `Overpass request failed with ${res.status}. Retrying... (${retries} left)`
        );
        await new Promise((r) => setTimeout(r, 1000));
        return this.fetchWithRetry(url, options, retries - 1);
      }

      return res;
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
