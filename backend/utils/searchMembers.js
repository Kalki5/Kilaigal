/**
 * Filter members by a case-insensitive name substring match.
 * Returns at most 20 results with only id, name, gender, and photoUrl fields.
 *
 * @param {Array<{ id: string, name: string, gender: string, photoUrl: string }>} members
 * @param {string} query - Search query (minimum 2 characters expected)
 * @returns {Array<{ id: string, name: string, gender: string, photoUrl: string }>}
 */
export function searchMembers(members, query) {
  return members
    .filter(m => m.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 20)
    .map(m => ({
      id: m.id,
      name: m.name,
      gender: m.gender,
      photoUrl: m.photoUrl,
    }));
}
