/**
 * Validate a depth parameter value.
 * @param {*} value - The raw depth value (from query string or other source)
 * @returns {{ valid: true, depth: number } | { valid: false, error: string }}
 */
export function validateDepth(value) {
  const depth = parseInt(value, 10);
  if (!Number.isInteger(depth) || depth < 1 || depth > 10) {
    return { valid: false, error: 'Depth must be an integer between 1 and 10' };
  }
  return { valid: true, depth };
}
