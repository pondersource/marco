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

    const url = `https://overpass.bke.ro/api/interpreter?data=${encodeURIComponent(
    // const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
      query
    )}`;

    try {
      const res = await this.fetchWithRetry(url, { signal });
      if (!res.ok) throw new Error('Overpass request failed');
      const data = await res.json();

      // Normalize data
      return data.elements.map(this.normalizePoi);
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('Overpass request aborted');
        return [];
      }
      throw e;
    }
  }

  normalizePoi(poi) {
    return {
      title: poi.tags?.name || poi.tags?.['name:en'] || 'Untitled Place',
      lat: poi.lat || poi.center?.lat,
      lon: poi.lon || poi.center?.lon,
      url: poi.tags?.website,
      osmId: String(poi.id),
      osmType: poi.type,
      osmTags: poi.tags || {},
      description: poi.tags?.description,
    };
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

  async getPoiById(id, type = null) {
    // If type is provided, we can be specific.
    // If not, we query both node and way.
    let query;

    if (type === 'node') {
      query = `[out:json][timeout:25];node(${id});out center;`;
    } else if (type === 'way') {
      query = `[out:json][timeout:25];way(${id});out center;`;
    } else {
      query = `
[out:json][timeout:25];
(
  node(${id});
  way(${id});
);
out center;
      `.trim();
    }

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
      query
    )}`;
    const res = await this.fetchWithRetry(url);
    if (!res.ok) throw new Error('Overpass request failed');
    const data = await res.json();
    if (!data.elements[0]) return null;
    return this.normalizePoi(data.elements[0]);
  }
}
