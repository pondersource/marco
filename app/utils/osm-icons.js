import { getIcon } from './icons';

// Rules for mapping OSM tags to icons.
// Rules are evaluated in order. The first rule where all specified tags match is used.
export const POI_ICON_RULES = [
  // Specific Cuisine
  { tags: { cuisine: 'donut' }, icon: 'donut' },
  { tags: { cuisine: 'doughnut' }, icon: 'donut' },
  { tags: { cuisine: 'coffee_shop' }, icon: 'coffee-bean' },
  { tags: { cuisine: 'coffee' }, icon: 'coffee-bean' },

  // General Amenity/Shop Types
  { tags: { amenity: 'ice_cream' }, icon: 'ice-cream-on-cone' },
  { tags: { cuisine: 'ice_cream' }, icon: 'ice-cream-on-cone' },
  { tags: { shop: 'ice_cream' }, icon: 'ice-cream-on-cone' },

  { tags: { amenity: 'cafe' }, icon: 'cup-and-saucer' },
  { tags: { amenity: 'restaurant' }, icon: 'fork-and-knife' },
  { tags: { amenity: 'fast_food' }, icon: 'burger-and-drink-cup-with-straw' },
  { tags: { amenity: 'pub' }, icon: 'beer-mug-with-foam' },
  { tags: { amenity: 'food_court' }, icon: 'fork-and-knife' },

  { tags: { shop: 'coffee' }, icon: 'coffee-bean' },
  { tags: { shop: 'tea' }, icon: 'coffee-bean' },
  { tags: { shop: 'pastry' }, icon: 'donut' }, // Pastry shops often have donuts

  // Groceries
  { tags: { shop: 'supermarket' }, icon: 'shopping-cart' },
  { tags: { shop: 'convenience' }, icon: 'shopping-basket' },
  { tags: { shop: 'grocery' }, icon: 'shopping-basket' },
  { tags: { shop: 'greengrocer' }, icon: 'shopping-basket' },
  { tags: { shop: 'bakery' }, icon: 'croissant' },
  { tags: { shop: 'butcher' }, icon: 'cleaver' },
  { tags: { shop: 'deli' }, icon: 'shopping-basket' },

  // Natural
  { tags: { natural: 'beach' }, icon: 'beach-umbrella-in-ground' },

  // Tourism
  { tags: { tourism: 'museum' }, icon: 'classical-building' },
  { tags: { tourism: 'gallery' }, icon: 'wall-hanging-with-mountains-and-sun' },
  { tags: { tourism: 'aquarium' }, icon: 'angelfish' },
  { tags: { tourism: 'theme_park' }, icon: 'camera' },
  { tags: { tourism: 'attraction' }, icon: 'camera' },
  { tags: { tourism: 'viewpoint' }, icon: 'camera' },
  { tags: { tourism: 'zoo' }, icon: 'camera' },
  { tags: { tourism: 'artwork' }, icon: 'camera' },
  { tags: { amenity: 'cinema' }, icon: 'film' },
  { tags: { amenity: 'theatre' }, icon: 'camera' },
  { tags: { amenity: 'arts_centre' }, icon: 'comedy-mask-and-tragedy-mask' },
  { tags: { amenity: 'arts_center' }, icon: 'comedy-mask-and-tragedy-mask' },

  // Historic
  { tags: { historic: 'fort' }, icon: 'fort' },
  { tags: { historic: 'castle' }, icon: 'palace' },
  { tags: { historic: 'building' }, icon: 'classical-building-with-flag' },
  { tags: { historic: 'archaeological_site' }, icon: 'camera' },
  { tags: { historic: 'memorial' }, icon: 'memorial-stone-with-inscription' },
  {
    tags: { historic: 'monument' },
    icon: 'classical-building-with-dome-and-flag',
  },
  { tags: { historic: 'ship' }, icon: 'sailing-ship-in-water' },

  // Accommodation
  { tags: { tourism: 'hotel' }, icon: 'person-sleeping-in-bed' },
  { tags: { tourism: 'hostel' }, icon: 'person-sleeping-in-bed' },
  { tags: { tourism: 'motel' }, icon: 'person-sleeping-in-bed' },
  { tags: { tourism: 'guest_house' }, icon: 'person-sleeping-in-bed' },

  // Sports / Motorsports
  { tags: { sport: 'motor' }, icon: 'flag-checkered' },
  { tags: { sport: 'karting' }, icon: 'flag-checkered' },
  { tags: { sport: 'motocross' }, icon: 'flag-checkered' },
  {
    tags: { sport: 'cricket' },
    icon: 'person-cricket-batting-at-cricket-ball',
  },
  { tags: { leisure: 'water_park' }, icon: 'person-swimming-in-water' },
  { tags: { sport: 'golf' }, icon: 'person-swinging-golf-club' },
  { tags: { leisure: 'golf_course' }, icon: 'person-swinging-golf-club' },
  { tags: { sport: 'horse_racing' }, icon: 'person-jockeying-racehorse' },
  { tags: { leisure: 'stadium' }, icon: 'round-structure-with-flag' },
  { tags: { sport: 'stadium' }, icon: 'round-structure-with-flag' },

  { tags: { leisure: 'sports_centre' }, icon: 'person-running' },
  { tags: { sport: 'fitness_centre' }, icon: 'person-running' },
];

/**
 * Finds the appropriate icon name based on the place's OSM tags.
 * @param {Object} tags - The OSM tags of the place.
 * @returns {string|null} - The name of the icon or null if no match found.
 */
export function getIconNameForTags(tags) {
  if (!tags) return null;

  for (const rule of POI_ICON_RULES) {
    let match = true;
    for (const [key, expectedValue] of Object.entries(rule.tags)) {
      const tagValue = tags[key];
      if (!tagValue) {
        match = false;
        break;
      }

      // Check for exact match or if value is in a semicolon-separated list
      // e.g. "donut;coffee_shop"
      const values = tagValue.split(';').map((v) => v.trim());
      if (!values.includes(expectedValue)) {
        match = false;
        break;
      }
    }
    if (match) {
      return rule.icon;
    }
  }
  return null;
}

/**
 * Returns the raw SVG string for the icon corresponding to the given tags.
 * @param {Object} tags - The OSM tags.
 * @returns {string|null} - The raw SVG string or null.
 */
export function getIconSvgForTags(tags) {
  const iconName = getIconNameForTags(tags);
  if (!iconName) return null;
  return getIcon(iconName);
}
