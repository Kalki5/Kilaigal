// Terminology pack: Spoken Tamil (default).
//
// Maps kin-slot -> { script, romanized, aliases }.
// NOTE: starting set. A few terms (cross-cousin, in-law) vary by speaker and
// MUST be validated by native speakers before shipping. Structure is final;
// the words are a first pass.

export default {
  id: "spoken-tamil",
  label: "பேச்சு தமிழ் (Spoken Tamil)",
  fallback: null,
  terms: {
    SELF: { script: "நான்", romanized: "Naan" },
    FATHER: { script: "அப்பா", romanized: "Appa" },
    MOTHER: { script: "அம்மா", romanized: "Amma" },
    SON: { script: "மகன்", romanized: "Magan" },
    DAUGHTER: { script: "மகள்", romanized: "Magal" },
    HUSBAND: { script: "கணவன்", romanized: "Kanavan", aliases: ["Purushan"] },
    WIFE: { script: "மனைவி", romanized: "Manaivi", aliases: ["Pondaatti"] },

    ELDER_BROTHER: { script: "அண்ணா", romanized: "Anna", aliases: ["Annan"] },
    YOUNGER_BROTHER: { script: "தம்பி", romanized: "Thambi" },
    ELDER_SISTER: { script: "அக்கா", romanized: "Akka" },
    YOUNGER_SISTER: { script: "தங்கை", romanized: "Thangai", aliases: ["Thangachi"] },

    GRANDFATHER_PATERNAL: { script: "தாத்தா", romanized: "Thatha" },
    GRANDFATHER_MATERNAL: { script: "தாத்தா", romanized: "Thatha" },
    GRANDMOTHER_PATERNAL: { script: "பாட்டி", romanized: "Paati" },
    GRANDMOTHER_MATERNAL: { script: "பாட்டி", romanized: "Paati" },
    GRANDSON: { script: "பேரன்", romanized: "Peran" },
    GRANDDAUGHTER: { script: "பேத்தி", romanized: "Pethi" },

    FATHER_ELDER_BROTHER: { script: "பெரியப்பா", romanized: "Periyappa" },
    FATHER_YOUNGER_BROTHER: { script: "சித்தப்பா", romanized: "Chithappa", aliases: ["Chittappa"] },
    FATHER_SISTER: { script: "அத்தை", romanized: "Attai", aliases: ["Athai"] },
    MOTHER_BROTHER: { script: "மாமா", romanized: "Maama", aliases: ["Maaman", "Mama"] },
    MOTHER_ELDER_SISTER: { script: "பெரியம்மா", romanized: "Periyamma" },
    MOTHER_YOUNGER_SISTER: { script: "சித்தி", romanized: "Chithi" },

    FATHER_ELDER_BROTHER_WIFE: { script: "பெரியம்மா", romanized: "Periyamma" },
    FATHER_YOUNGER_BROTHER_WIFE: { script: "சித்தி", romanized: "Chithi" },
    FATHER_SISTER_HUSBAND: { script: "மாமா", romanized: "Maama" },
    MOTHER_BROTHER_WIFE: { script: "மாமி", romanized: "Maami" },
    MOTHER_ELDER_SISTER_HUSBAND: { script: "பெரியப்பா", romanized: "Periyappa" },
    MOTHER_YOUNGER_SISTER_HUSBAND: { script: "சித்தப்பா", romanized: "Chithappa" },

    CROSS_COUSIN_MALE_ELDER: { script: "அத்தான்", romanized: "Athaan", aliases: ["Maccaan"] },
    CROSS_COUSIN_MALE_YOUNGER: { script: "மச்சான்", romanized: "Maccaan", aliases: ["Machaan"] },
    CROSS_COUSIN_FEMALE: { script: "மச்சினி", romanized: "Machini", aliases: ["Maccal"] },

    FATHER_IN_LAW: { script: "மாமா", romanized: "Maama", aliases: ["Maamanaar"] },
    MOTHER_IN_LAW: { script: "மாமியார்", romanized: "Maamiyaar", aliases: ["Attai"] },
    SON_IN_LAW: { script: "மருமகன்", romanized: "Marumagan", aliases: ["Mappillai"] },
    DAUGHTER_IN_LAW: { script: "மருமகள்", romanized: "Marumagal" },
    SIBLING_IN_LAW_MALE: { script: "மச்சான்", romanized: "Maccaan", aliases: ["Athaan"] },
    SIBLING_IN_LAW_FEMALE: { script: "நாத்தனார்", romanized: "Naathanaar" },

    // Coarse fallbacks (used when a pack omits the fine elder/younger split)
    FATHER_BROTHER: { script: "அப்பாவின் சகோதரர்", romanized: "Appavin Sagotharar" },
    MOTHER_SISTER: { script: "அம்மாவின் சகோதரி", romanized: "Ammavin Sagothari" },

    UNKNOWN: { script: "உறவினர்", romanized: "Uravinar" },
  },
};
