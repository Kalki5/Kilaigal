// Terminology pack: Iyer (STUB — illustrative overrides only).
//
// Demonstrates the override + fallback mechanism: only slots that DIFFER from
// the default are listed; everything else falls back to spoken-tamil.
// These overrides are placeholders and MUST be validated by native speakers.

export default {
  id: "iyer",
  label: "ஐயர்",
  fallback: "spoken-tamil",
  terms: {
    // Iyer usage commonly says "Mama" for mother's brother / father-in-law.
    MOTHER_BROTHER: { script: "மாமா", romanized: "Mama" },
    FATHER_SISTER: { script: "அத்தை", romanized: "Atthai" },
    FATHER_YOUNGER_BROTHER: { script: "சித்தப்பா", romanized: "Chithappa", aliases: ["Chinna Appa"] },
  },
};
