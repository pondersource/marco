import { helper } from '@ember/component/helper';
import { humanizeOsmTag as format } from '../utils/format-text';

export default helper(function humanizeOsmTag([text]) {
  return format(text);
});
