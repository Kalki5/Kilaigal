/**
 * Check if a candidate relation already exists in either direction.
 *
 * A duplicate is detected when:
 * - forwardRelations (relations originating from fromId) contain one with toId and type matching, OR
 * - reverseRelations (relations originating from toId) contain one with toId === fromId and type matching
 *
 * @param {object[]} forwardRelations - Relations where fromId is the source
 * @param {object[]} reverseRelations - Relations where toId is the source
 * @param {string} fromId - Source member ID of the candidate relation
 * @param {string} toId - Target member ID of the candidate relation
 * @param {string} type - Relation type of the candidate relation
 * @returns {boolean} True if a duplicate exists in either direction
 */
export function isDuplicate(forwardRelations, reverseRelations, fromId, toId, type) {
  const forwardDuplicate = forwardRelations.some(
    (rel) => rel.toId === toId && rel.type === type
  );

  const reverseDuplicate = reverseRelations.some(
    (rel) => rel.toId === fromId && rel.type === type
  );

  return forwardDuplicate || reverseDuplicate;
}
