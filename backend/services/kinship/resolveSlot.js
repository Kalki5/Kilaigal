// Kinship slot resolver.
//
// Resolves a graph PATH (a sequence of primitive hops from ego to alter) into a
// community-independent KIN-SLOT. The slot is the stable interface; a
// terminology pack then maps slot -> surface term (see packs/).
//
// A "step" is one hop along the path, shaped:
//   { rel: 'parent'|'child'|'spouse'|'sibling',
//     gender: 'Male'|'Female'|'Other',   // gender of the person you ARRIVE at
//     elder?: boolean }                  // for sibling steps; see contract below
//
// `elder` contract: "is the arrived person elder than the person departed from?"
//   - gen-0 sibling step      -> elder than ego           (anna vs thambi)
//   - parent's sibling step   -> elder than the parent     (periyappa vs chithappa)
//   - cousin terminal step    -> elder than EGO (ego-relative, since net gen 0)

export const SLOTS = {
  SELF: "SELF",
  FATHER: "FATHER",
  MOTHER: "MOTHER",
  SON: "SON",
  DAUGHTER: "DAUGHTER",
  HUSBAND: "HUSBAND",
  WIFE: "WIFE",
  ELDER_BROTHER: "ELDER_BROTHER",
  YOUNGER_BROTHER: "YOUNGER_BROTHER",
  ELDER_SISTER: "ELDER_SISTER",
  YOUNGER_SISTER: "YOUNGER_SISTER",
  GRANDFATHER_PATERNAL: "GRANDFATHER_PATERNAL",
  GRANDFATHER_MATERNAL: "GRANDFATHER_MATERNAL",
  GRANDMOTHER_PATERNAL: "GRANDMOTHER_PATERNAL",
  GRANDMOTHER_MATERNAL: "GRANDMOTHER_MATERNAL",
  GRANDSON: "GRANDSON",
  GRANDDAUGHTER: "GRANDDAUGHTER",
  // Parent's siblings (blood)
  FATHER_ELDER_BROTHER: "FATHER_ELDER_BROTHER",
  FATHER_YOUNGER_BROTHER: "FATHER_YOUNGER_BROTHER",
  FATHER_SISTER: "FATHER_SISTER",
  MOTHER_BROTHER: "MOTHER_BROTHER",
  MOTHER_ELDER_SISTER: "MOTHER_ELDER_SISTER",
  MOTHER_YOUNGER_SISTER: "MOTHER_YOUNGER_SISTER",
  // Parent's siblings' spouses (by marriage)
  FATHER_ELDER_BROTHER_WIFE: "FATHER_ELDER_BROTHER_WIFE",
  FATHER_YOUNGER_BROTHER_WIFE: "FATHER_YOUNGER_BROTHER_WIFE",
  FATHER_SISTER_HUSBAND: "FATHER_SISTER_HUSBAND",
  MOTHER_BROTHER_WIFE: "MOTHER_BROTHER_WIFE",
  MOTHER_ELDER_SISTER_HUSBAND: "MOTHER_ELDER_SISTER_HUSBAND",
  MOTHER_YOUNGER_SISTER_HUSBAND: "MOTHER_YOUNGER_SISTER_HUSBAND",
  // Cousins
  CROSS_COUSIN_MALE_ELDER: "CROSS_COUSIN_MALE_ELDER",
  CROSS_COUSIN_MALE_YOUNGER: "CROSS_COUSIN_MALE_YOUNGER",
  CROSS_COUSIN_FEMALE: "CROSS_COUSIN_FEMALE",
  // In-laws
  FATHER_IN_LAW: "FATHER_IN_LAW",
  MOTHER_IN_LAW: "MOTHER_IN_LAW",
  SON_IN_LAW: "SON_IN_LAW",
  DAUGHTER_IN_LAW: "DAUGHTER_IN_LAW",
  SIBLING_IN_LAW_MALE: "SIBLING_IN_LAW_MALE",
  SIBLING_IN_LAW_FEMALE: "SIBLING_IN_LAW_FEMALE",
  UNKNOWN: "UNKNOWN",
};

const isFemale = (g) => g === "Female";
const isMale = (g) => g === "Male";

function siblingSlot(step) {
  const elder = step.elder === true;
  if (isFemale(step.gender)) return elder ? SLOTS.ELDER_SISTER : SLOTS.YOUNGER_SISTER;
  if (isMale(step.gender)) return elder ? SLOTS.ELDER_BROTHER : SLOTS.YOUNGER_BROTHER;
  return SLOTS.UNKNOWN;
}

function grandparentSlot(steps) {
  const maternal = isFemale(steps[0].gender); // first parent's gender = side
  const alter = steps[1].gender;
  if (isFemale(alter)) return maternal ? SLOTS.GRANDMOTHER_MATERNAL : SLOTS.GRANDMOTHER_PATERNAL;
  if (isMale(alter)) return maternal ? SLOTS.GRANDFATHER_MATERNAL : SLOTS.GRANDFATHER_PATERNAL;
  return SLOTS.UNKNOWN;
}

// parent's sibling (blood uncle/aunt)
function parentSiblingSlot(steps) {
  const parent = steps[0].gender;
  const sib = steps[1];
  const elder = sib.elder === true;
  if (isMale(parent)) {
    if (isMale(sib.gender)) return elder ? SLOTS.FATHER_ELDER_BROTHER : SLOTS.FATHER_YOUNGER_BROTHER; // parallel
    if (isFemale(sib.gender)) return SLOTS.FATHER_SISTER; // cross
  }
  if (isFemale(parent)) {
    if (isMale(sib.gender)) return SLOTS.MOTHER_BROTHER; // cross
    if (isFemale(sib.gender)) return elder ? SLOTS.MOTHER_ELDER_SISTER : SLOTS.MOTHER_YOUNGER_SISTER; // parallel
  }
  return SLOTS.UNKNOWN;
}

// parent's sibling's spouse (uncle/aunt by marriage)
function parentSiblingSpouseSlot(steps) {
  const parent = steps[0].gender;
  const sib = steps[1];
  const elder = sib.elder === true;
  if (isMale(parent)) {
    if (isMale(sib.gender)) return elder ? SLOTS.FATHER_ELDER_BROTHER_WIFE : SLOTS.FATHER_YOUNGER_BROTHER_WIFE;
    if (isFemale(sib.gender)) return SLOTS.FATHER_SISTER_HUSBAND;
  }
  if (isFemale(parent)) {
    if (isMale(sib.gender)) return SLOTS.MOTHER_BROTHER_WIFE;
    if (isFemale(sib.gender)) return elder ? SLOTS.MOTHER_ELDER_SISTER_HUSBAND : SLOTS.MOTHER_YOUNGER_SISTER_HUSBAND;
  }
  return SLOTS.UNKNOWN;
}

// parent's sibling's child (cousin)
function cousinSlot(steps) {
  const parent = steps[0].gender;
  const sib = steps[1].gender;
  const cousin = steps[2]; // gender + elder (ego-relative)
  const parallel = parent === sib; // same-gender sibling link => parallel
  if (parallel) {
    // parallel cousins are addressed as siblings
    return siblingSlot(cousin);
  }
  // cross cousins (the marriageable category)
  if (isMale(cousin.gender)) {
    return cousin.elder === true ? SLOTS.CROSS_COUSIN_MALE_ELDER : SLOTS.CROSS_COUSIN_MALE_YOUNGER;
  }
  if (isFemale(cousin.gender)) return SLOTS.CROSS_COUSIN_FEMALE;
  return SLOTS.UNKNOWN;
}

/**
 * Resolve a path of primitive steps to a kin-slot.
 * Returns SLOTS.UNKNOWN for paths outside the v1 coverage set (deeper than
 * grandparents / first cousins / one marriage hop) — the caller can fall back
 * to LLM narration for those.
 *
 * @param {Array<{rel:string, gender:string, elder?:boolean}>} steps
 * @returns {string} slot
 */
export function resolveSlot(steps) {
  if (!Array.isArray(steps)) return SLOTS.UNKNOWN;
  const seq = steps.map((s) => s.rel).join("-");
  const last = steps[steps.length - 1];

  switch (seq) {
    case "":
      return SLOTS.SELF;
    case "parent":
      return isFemale(last.gender) ? SLOTS.MOTHER : isMale(last.gender) ? SLOTS.FATHER : SLOTS.UNKNOWN;
    case "child":
      return isFemale(last.gender) ? SLOTS.DAUGHTER : isMale(last.gender) ? SLOTS.SON : SLOTS.UNKNOWN;
    case "spouse":
      return isFemale(last.gender) ? SLOTS.WIFE : isMale(last.gender) ? SLOTS.HUSBAND : SLOTS.UNKNOWN;
    case "sibling":
      return siblingSlot(last);
    case "parent-parent":
      return grandparentSlot(steps);
    case "child-child":
      return isFemale(last.gender) ? SLOTS.GRANDDAUGHTER : isMale(last.gender) ? SLOTS.GRANDSON : SLOTS.UNKNOWN;
    case "parent-sibling":
      return parentSiblingSlot(steps);
    case "parent-sibling-spouse":
      return parentSiblingSpouseSlot(steps);
    case "parent-sibling-child":
      return cousinSlot(steps);
    case "spouse-parent":
      return isFemale(last.gender) ? SLOTS.MOTHER_IN_LAW : isMale(last.gender) ? SLOTS.FATHER_IN_LAW : SLOTS.UNKNOWN;
    case "child-spouse":
      return isFemale(last.gender) ? SLOTS.DAUGHTER_IN_LAW : isMale(last.gender) ? SLOTS.SON_IN_LAW : SLOTS.UNKNOWN;
    case "sibling-spouse":
    case "spouse-sibling":
      return isFemale(last.gender) ? SLOTS.SIBLING_IN_LAW_FEMALE : isMale(last.gender) ? SLOTS.SIBLING_IN_LAW_MALE : SLOTS.UNKNOWN;
    default:
      return SLOTS.UNKNOWN;
  }
}
