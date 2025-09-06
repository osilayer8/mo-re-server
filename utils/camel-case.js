export const toCamelCase = (obj) => {
  // Handle null or undefined
  if (obj == null) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => toCamelCase(item));
  }

  // Handle Date objects or ISO date strings
  if (obj instanceof Date) {
    return obj; // Return Date object unchanged
  }
  if (
    typeof obj === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(obj)
  ) {
    return obj; // Return ISO date string unchanged
  }

  // Handle plain objects
  if (typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (match, letter) =>
        letter.toUpperCase()
      );
      acc[camelKey] = toCamelCase(obj[key]);
      return acc;
    }, {});
  }

  // Return primitives (string, number, boolean, etc.) unchanged
  return obj;
};
