import { helper } from '@ember/component/helper';
import { capitalize as format } from '../utils/format-text';

export default helper(function capitalize([text]) {
  return format(text);
});
