// This configuration defines the "Quick Search" categories available in the UI.
//
// Structure:
// - id: The URL slug used for routing (e.g. ?category=restaurants)
// - label: The human-readable name displayed in the UI
// - icon: The icon name (must be registered in app/utils/icons.js)
// - filter: An array of Overpass QL query parts.
//   - Each string in the array is an independent query condition.
//   - Multiple strings act as an OR condition (union of results).

export const POI_CATEGORIES = [
  {
    id: 'restaurants',
    label: 'Restaurants',
    icon: 'fork-and-knife',
    filter: [
      '["amenity"~"^(restaurant|fast_food|food_court|pub|cafe)$"]["cuisine"!~"coffee"]',
    ],
    types: ['node', 'way'],
  },
  {
    id: 'coffee',
    label: 'Coffee',
    icon: 'cup-and-saucer',
    filter: [
      '["amenity"~"^(cafe|ice_cream)$"]',
      '["shop"~"^(coffee|tea)$"]',
      '["cuisine"~"coffee_shop"]',
    ],
    types: ['node', 'way'],
  },
  {
    id: 'groceries',
    label: 'Groceries',
    icon: 'shopping-basket',
    filter: [
      '["shop"~"^(supermarket|convenience|grocery|greengrocer|bakery|butcher|deli|farm|seafood)$"]',
    ],
    types: ['node', 'way'],
  },
  {
    id: 'things-to-do',
    label: 'Things to do',
    icon: 'feather-camera',
    filter: [
      '["tourism"~"^(museum|gallery|attraction|viewpoint|zoo|theme_park|aquarium|artwork|information)$"]',
      '["amenity"~"^(cinema|theatre|arts_centre|planetarium)$"]',
      '["leisure"~"^(sports_centre|stadium|water_park|golf_course|marina)$"]',
      '["historic"]',
      '["shop"="flea_market"]',
    ],
    types: ['node', 'way', 'relation'],
  },
  {
    id: 'accommodation',
    label: 'Hotels',
    icon: 'person-sleeping-in-bed',
    filter: [
      '["tourism"~"^(hotel|hostel|motel|chalet|guest_house)$"]',
      '["leisure"="resort"]',
    ],
    types: ['node', 'way', 'relation'],
  },
];

// Special-cased category for spatial "Nearby" searches (triggered by clicking
// the map). It intentionally lives outside POI_CATEGORIES so it does not show
// up as a quick-search chip or in the search autocomplete. Like other
// categories it is represented in the URL as ?category=nearby, which lets the
// UI display its label and offer a clear button.
export const NEARBY_CATEGORY = {
  id: 'nearby',
  label: 'Nearby',
  icon: 'target',
};

export function getCategoryById(id) {
  if (id === NEARBY_CATEGORY.id) return NEARBY_CATEGORY;
  return POI_CATEGORIES.find((c) => c.id === id);
}
