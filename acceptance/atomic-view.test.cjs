const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');

function node(tag) {
  return {
    tag,
    value: '',
    children: [],
    handlers: {},
    prepend(...children) {
      this.children.unshift(...children);
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute() {},
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
  };
}

function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

test('render the offline map and store a place with coordinates', async () => {
  const source = readFileSync('atomic/marco-0.1.0.js', 'utf8');
  const { view } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
  global.document = {
    createElement: (tag) => ({
      ...node(tag),
      style: {},
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  };
  const core = 'https://atomicdata.dev/properties/';
  const data = new Map();
  function resource(subject) {
    const props = { ...data.get(subject) };
    return {
      subject,
      get: (key) => props[key],
      set: (key, value) => {
        props[key] = value;
      },
      save: async () => {
        data.set(subject, props);
      },
    };
  }
  const store = {
    getData: async () => ({ table: 'inbox', rowClass: 'item' }),
    query: async () => [...data.keys()],
    getMany: async (subjects) => subjects.map(resource),
    getResource: async (subject) => resource(subject),
    newResource: async ({ parent, isA, propVals }) => {
      data.set('saved', {
        ...propVals,
        [`${core}parent`]: parent,
        [`${core}isA`]: isA,
      });
    },
  };
  const root = node('div');
  await view({ root, store });
  const button = (text) =>
    find(root, (n) => n.tag === 'button' && n.textContent === text);
  const namedField = (name) =>
    find(root, (n) => n.tag === 'label' && n.textContent === name).children[0];
  namedField('Place').value = 'Nijmegen';
  namedField('List').value = 'Cities';
  namedField('Latitude').valueAsNumber = 51.84;
  namedField('Longitude').valueAsNumber = 5.86;
  await button('Save place').handlers.click();
  const payload = data.get('saved')[`${core}description`];
  assert.equal(JSON.parse(payload.slice('marco-place/v1:'.length)).lat, 51.84);
  assert.equal(JSON.parse(payload.slice('marco-place/v1:'.length)).lon, 5.86);
  await view({ root, store });
  assert.ok(find(root, (n) => n.tag === 'h2' && n.textContent === 'Nijmegen'));
});
