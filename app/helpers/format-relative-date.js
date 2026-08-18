import { helper } from '@ember/component/helper';
import { formatRelativeDate as format } from '../utils/format-text';

export default helper(function formatRelativeDate([timestamp]) {
  return format(timestamp);
});
