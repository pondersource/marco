export function getMatchingPoiCategories(osmTags, categories) {
  if (!Array.isArray(categories) || !osmTags) return [];

  return categories.filter((category) => {
    if (!Array.isArray(category.filter)) return false;
    return category.filter.some((filterStr) =>
      matchesFilter(osmTags, filterStr)
    );
  });
}

export function getMatchingPoiCategoryIds(osmTags, categories) {
  return getMatchingPoiCategories(osmTags, categories).map((c) => c.id);
}

function matchesFilter(osmTags, filterStr) {
  const clauses = parseOverpassClauses(filterStr);
  if (clauses.length === 0) return false;
  return clauses.every((clause) => matchesClause(osmTags, clause));
}

function parseOverpassClauses(filterStr) {
  if (!filterStr) return [];
  const matches = filterStr.match(/\[[^\]]+\]/g);
  if (!matches) return [];

  return matches
    .map((raw) => parseClause(raw.slice(1, -1).trim()))
    .filter(Boolean);
}

function parseClause(content) {
  const presenceMatch = content.match(/^"([^"]+)"$/);
  if (presenceMatch) {
    return { type: 'presence', key: presenceMatch[1] };
  }

  const equalsMatch = content.match(/^"([^"]+)"\s*=\s*"([^"]*)"$/);
  if (equalsMatch) {
    return { type: 'equals', key: equalsMatch[1], value: equalsMatch[2] };
  }

  const regexMatch = content.match(/^"([^"]+)"\s*~\s*"([^"]*)"$/);
  if (regexMatch) {
    return {
      type: 'regex',
      key: regexMatch[1],
      pattern: regexMatch[2],
      regex: new RegExp(regexMatch[2]),
    };
  }

  const notRegexMatch = content.match(/^"([^"]+)"\s*!~\s*"([^"]*)"$/);
  if (notRegexMatch) {
    return {
      type: 'not-regex',
      key: notRegexMatch[1],
      pattern: notRegexMatch[2],
      regex: new RegExp(notRegexMatch[2]),
    };
  }

  return null;
}

function matchesClause(osmTags, clause) {
  const tagValues = getTagValues(osmTags, clause.key);

  switch (clause.type) {
    case 'presence':
      return tagValues.length > 0;
    case 'equals':
      return tagValues.some((value) => value === clause.value);
    case 'regex':
      return tagValues.some((value) => clause.regex.test(value));
    case 'not-regex':
      return (
        tagValues.length === 0 ||
        !tagValues.some((value) => clause.regex.test(value))
      );
    default:
      return false;
  }
}

function getTagValues(osmTags, key) {
  if (!osmTags || !key) return [];
  const rawValue = osmTags[key];
  if (rawValue === undefined || rawValue === null) return [];

  return String(rawValue)
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean);
}
