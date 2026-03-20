import Controller from '@ember/controller';

export default class SearchController extends Controller {
  queryParams = ['lat', 'lon', 'q', 'selected', 'category'];

  lat = null;
  lon = null;
  q = null;
  selected = null;
  category = null;
}
