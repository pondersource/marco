import { getLocalizedName } from './osm';

export function mapToStorageSchema(place) {
  return {
    title: place.title || getLocalizedName(place.osmTags, 'Untitled Place'),
    lat: place.lat,
    lon: place.lon,
    tags: [],
    url: place.osmTags?.website,
    osmId: String(place.osmId || place.id),
    osmType: place.osmType,
    osmTags: place.osmTags || {},
    description: place.description,
  };
}
