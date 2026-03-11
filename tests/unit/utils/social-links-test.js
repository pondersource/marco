import { getSocialInfo } from 'marco/utils/social-links';
import { module, test } from 'qunit';

module('Unit | Utility | social-links', function () {
  test('it returns null if tags are missing', function (assert) {
    let result = getSocialInfo({}, 'facebook');
    assert.strictEqual(result, null);
  });

  test('it returns null if specific platform tags are missing', function (assert) {
    let result = getSocialInfo({ twitter: 'foo' }, 'facebook');
    assert.strictEqual(result, null);
  });

  test('it handles simple usernames', function (assert) {
    let result = getSocialInfo({ facebook: 'foo' }, 'facebook');
    assert.deepEqual(result, {
      url: 'https://facebook.com/foo',
      username: 'foo',
    });

    result = getSocialInfo({ 'contact:instagram': '@bar' }, 'instagram');
    assert.deepEqual(result, {
      url: 'https://instagram.com/bar',
      username: 'bar',
    });
  });

  test('it handles full URLs', function (assert) {
    let result = getSocialInfo(
      { facebook: 'https://www.facebook.com/foo' },
      'facebook'
    );
    assert.deepEqual(result, {
      url: 'https://www.facebook.com/foo',
      username: 'foo',
    });
  });

  test('it handles Facebook profile.php URLs', function (assert) {
    let result = getSocialInfo(
      { facebook: 'https://www.facebook.com/profile.php?id=12345' },
      'facebook'
    );
    assert.deepEqual(result, {
      url: 'https://www.facebook.com/profile.php?id=12345',
      username: '12345',
    });
  });

  test('it falls back gracefully for malformed URLs', function (assert) {
    let result = getSocialInfo({ facebook: 'http://' }, 'facebook');
    assert.deepEqual(result, {
      url: 'http://',
      username: 'http://',
    });
  });

  test('it prioritizes contact:tag over tag', function (assert) {
    let result = getSocialInfo(
      { 'contact:facebook': 'priority', facebook: 'fallback' },
      'facebook'
    );
    assert.strictEqual(result.username, 'priority');
  });
});
