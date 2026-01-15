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
}
