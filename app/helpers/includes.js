import { helper } from '@ember/component/helper';

export default helper(function includes([collection, value]) {
  if (!Array.isArray(collection)) return false;
  return collection.includes(value);
});
