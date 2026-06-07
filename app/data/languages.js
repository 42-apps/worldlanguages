/* ============================================================================
   WorldLanguages — language taxonomy + time axis
   ----------------------------------------------------------------------------
   LANGUAGES: every language (or language group) we colour, spanning the earliest
   written records to today. Keys are used throughout LANGUAGE_DATA. Colours are
   grouped by FAMILY (a shared hue per family) so the map reads as family regions,
   while the specific language is shown in labels/breakdowns. Major world languages
   get their own entry; smaller or historical tongues are grouped by branch. Only
   the languages present in a given era appear on the map at that time.

   TIME_SLICES: the ordered snapshots the slider steps through — non-linear by
   design (coarse in antiquity, finer toward the present). NO future projection.
   era ∈ ancient | historical | documented drives confidence styling.
   ========================================================================== */
'use strict';

window.LANGUAGES = {
  /* ---- Italic / Romance (reds & oranges) ---- */
  latin:        { label: 'Latin',                  family: 'Italic',      color: '#922B21' }, // classical
  french:       { label: 'French',                 family: 'Romance',     color: '#E74C3C' },
  spanish:      { label: 'Spanish',                family: 'Romance',     color: '#E67E22' },
  portuguese:   { label: 'Portuguese',             family: 'Romance',     color: '#BA6810' },
  italian:      { label: 'Italian',                family: 'Romance',     color: '#CD5C5C' },
  romanian:     { label: 'Romanian',               family: 'Romance',     color: '#D98880' },
  romance:      { label: 'Other Romance',          family: 'Romance',     color: '#EC7063' }, // Catalan, Occitan, Galician…

  /* ---- Germanic (blues) ---- */
  english:      { label: 'English',                family: 'Germanic',    color: '#2E86C1' },
  german:       { label: 'German',                 family: 'Germanic',    color: '#1A5276' },
  dutch:        { label: 'Dutch / Flemish',        family: 'Germanic',    color: '#4DA8D5' },
  nordic:       { label: 'Scandinavian / Norse',   family: 'Germanic',    color: '#7196D6' }, // Swedish/Danish/Norwegian/Icelandic + Old Norse
  germanic:     { label: 'Other Germanic',         family: 'Germanic',    color: '#9DD8E7' }, // Gothic, Frisian…

  /* ---- Other Indo-European ---- */
  greek:        { label: 'Greek',                  family: 'Hellenic',    color: '#B7950B' }, // ancient + modern
  celtic:       { label: 'Celtic',                 family: 'Celtic',      color: '#2BA191' }, // Gaulish, Brythonic, Gaelic, Welsh
  russian:      { label: 'Russian',                family: 'Slavic',      color: '#74338A' },
  slavic:       { label: 'Other Slavic',           family: 'Slavic',      color: '#AB70C2' }, // Polish, Ukrainian, Czech, Serbo-Croatian, Bulgarian, OCS…
  baltic:       { label: 'Baltic',                 family: 'Balto-Slavic',color: '#A69ADF' }, // Lithuanian, Latvian, Old Prussian
  albanian:     { label: 'Albanian',               family: 'Indo-European', color: '#7149AB' },
  armenian:     { label: 'Armenian',               family: 'Indo-European', color: '#636DBF' },

  /* ---- Indo-Iranian (pinks/magentas) ---- */
  sanskrit:     { label: 'Sanskrit / Prakrit',     family: 'Indo-Aryan',  color: '#C25B9D' }, // classical Indic
  hindustani:   { label: 'Hindi–Urdu',             family: 'Indo-Aryan',  color: '#E91E63' },
  bengali:      { label: 'Bengali',                family: 'Indo-Aryan',  color: '#AD1457' },
  indic:        { label: 'Other Indo-Aryan',       family: 'Indo-Aryan',  color: '#ED6E8B' }, // Punjabi, Marathi, Gujarati, Nepali, Sinhala…
  persian:      { label: 'Persian / Iranian',      family: 'Iranian',     color: '#D194CD' }, // Old Persian, Farsi, Pashto, Kurdish

  /* ---- Dravidian ---- */
  dravidian:    { label: 'Dravidian',              family: 'Dravidian',   color: '#5D4037' }, // Tamil, Telugu, Kannada, Malayalam

  /* ---- Afroasiatic (greens & sand) ---- */
  arabic:       { label: 'Arabic',                 family: 'Semitic',     color: '#1E8449' },
  hebrew:       { label: 'Hebrew',                 family: 'Semitic',     color: '#60C794' },
  aramaic:      { label: 'Aramaic',                family: 'Semitic',     color: '#145A32' }, // classical lingua franca
  semitic:      { label: 'Other Semitic',          family: 'Semitic',     color: '#3CB446' }, // Phoenician, Amharic, Tigrinya, Akkadian-as-Semitic…
  egyptian:     { label: 'Egyptian / Coptic',      family: 'Afroasiatic', color: '#C8B273' }, // ancient Egyptian → Coptic
  berber:       { label: 'Berber',                 family: 'Afroasiatic', color: '#95CF77' },
  cushitic:     { label: 'Cushitic',               family: 'Afroasiatic', color: '#98D7CA' }, // Somali, Oromo

  /* ---- Mesopotamian (ancient, ochre) ---- */
  mesopotamian: { label: 'Sumerian / Akkadian',    family: 'Mesopotamian',color: '#935116' }, // + Elamite, Hurrian, Hittite-era

  /* ---- Sino-Tibetan & East Asian (yellows/ambers) ---- */
  chinese:      { label: 'Chinese',                family: 'Sino-Tibetan',color: '#F1C40F' }, // Mandarin + varieties
  tibetoburman: { label: 'Tibeto-Burman',          family: 'Sino-Tibetan',color: '#F7DC6F' }, // Tibetan, Burmese
  japanese:     { label: 'Japanese',               family: 'Japonic',     color: '#F39C12' },
  korean:       { label: 'Korean',                 family: 'Koreanic',    color: '#E59866' },

  /* ---- Turkic / Mongolic (khaki) ---- */
  turkic:       { label: 'Turkic',                 family: 'Turkic',      color: '#9A7D0A' }, // Turkish, Azeri, Uzbek, Kazakh, Uyghur…
  mongolic:     { label: 'Mongolic',               family: 'Mongolic',    color: '#7D6608' },

  /* ---- Mainland & Island SE Asia (teals/turquoise) ---- */
  austronesian: { label: 'Austronesian',           family: 'Austronesian',color: '#32BD94' }, // Malay/Indonesian, Tagalog, Polynesian, Malagasy
  austroasiatic:{ label: 'Austroasiatic',          family: 'Austroasiatic',color: '#1A959E' },// Vietnamese, Khmer
  tai:          { label: 'Tai-Kadai',              family: 'Tai-Kadai',   color: '#6ACDCA' }, // Thai, Lao

  /* ---- African (ochres & greys) ---- */
  nigercongo:   { label: 'Niger-Congo / Bantu',    family: 'Niger-Congo', color: '#D68910' }, // Swahili, Yoruba, Zulu, Igbo…
  nilosaharan:  { label: 'Nilo-Saharan',           family: 'Nilo-Saharan',color: '#9C640C' },
  khoisan:      { label: 'Khoisan',                family: 'Khoisan',     color: '#7F8C8D' }, // click languages of southern Africa

  /* ---- Northern Eurasia ---- */
  uralic:       { label: 'Uralic',                 family: 'Uralic',      color: '#5D6D7E' }, // Finnish, Hungarian, Estonian, Sami
  caucasian:    { label: 'Caucasian',              family: 'Caucasian',   color: '#34495E' }, // Georgian, Chechen, Circassian

  /* ---- Indigenous Americas ---- */
  mesoamerican: { label: 'Mesoamerican',           family: 'Amerindian',  color: '#2F7F59' }, // Nahuatl, Maya, Zapotec
  andean:       { label: 'Andean',                 family: 'Amerindian',  color: '#39C668' }, // Quechua, Aymara
  amerindian:   { label: 'Other Native American',  family: 'Amerindian',  color: '#8E44AD' }, // North & South American families

  /* ---- Oceania ---- */
  aboriginal:   { label: 'Aboriginal Australian',  family: 'Australian',  color: '#BA4A00' },
  papuan:       { label: 'Papuan',                 family: 'Papuan',      color: '#924D2A' },

  other:        { label: 'Other / various',        family: '—',           color: '#95A5A6' },
};

window.TIME_SLICES = [
  { id: '-3000', label: '3000 BC', era: 'ancient'    },
  { id: '-2000', label: '2000 BC', era: 'ancient'    },
  { id: '-1000', label: '1000 BC', era: 'ancient'    },
  { id: '-500',  label: '500 BC',  era: 'ancient'    },
  { id: '1',     label: '1 CE',    era: 'ancient'    },
  { id: '300',   label: '300 CE',  era: 'historical' },
  { id: '500',   label: '500 CE',  era: 'historical' },
  { id: '750',   label: '750 CE',  era: 'historical' },
  { id: '1000',  label: '1000 CE', era: 'historical' },
  { id: '1300',  label: '1300 CE', era: 'historical' },
  { id: '1500',  label: '1500 CE', era: 'historical' },
  { id: '1700',  label: '1700',    era: 'historical' },
  { id: '1800',  label: '1800',    era: 'historical' },
  { id: '1900',  label: '1900',    era: 'documented' },
  { id: '1950',  label: '1950',    era: 'documented' },
  { id: '2000',  label: '2000',    era: 'documented' },
  { id: '2025',  label: 'Today',   era: 'documented' },
];

/* ----------------------------------------------------------------------------
   PHYLA — top-level language families for the optional "Family view" toggle.
   In family view every language above is rolled up to its phylum (e.g. English,
   Spanish, Hindi-Urdu, Russian, Persian, Greek, Latin → Indo-European), so the
   map reads as the world's great language families. FAMILY_TO_PHYLUM maps each
   LANGUAGES[].family (a branch) to its phylum; PHYLA gives each a label + colour.
   ========================================================================== */
window.PHYLA = {
  'Indo-European':  { label: 'Indo-European',  color: '#4E6FD0' }, // Romance, Germanic, Slavic, Indo-Aryan, Iranian, Hellenic, Celtic, Baltic, Armenian, Albanian
  'Afroasiatic':    { label: 'Afroasiatic',    color: '#1E9E54' }, // Semitic (Arabic/Hebrew/Aramaic), Berber, Cushitic, Egyptian
  'Mesopotamian':   { label: 'Mesopotamian',   color: '#935116' }, // ancient Sumerian/Akkadian/Elamite/Hurrian-Hittite sphere
  'Dravidian':      { label: 'Dravidian',      color: '#5D4037' },
  'Sino-Tibetan':   { label: 'Sino-Tibetan',   color: '#F1C40F' }, // Chinese, Tibeto-Burman
  'Japonic':        { label: 'Japonic',        color: '#F39C12' },
  'Koreanic':       { label: 'Koreanic',       color: '#E59866' },
  'Turkic':         { label: 'Turkic',         color: '#9A7D0A' },
  'Mongolic':       { label: 'Mongolic',       color: '#7D6608' },
  'Austronesian':   { label: 'Austronesian',   color: '#32BD94' },
  'Austroasiatic':  { label: 'Austroasiatic',  color: '#1A959E' },
  'Tai-Kadai':      { label: 'Tai-Kadai',      color: '#6ACDCA' },
  'Niger-Congo':    { label: 'Niger-Congo',    color: '#D68910' },
  'Nilo-Saharan':   { label: 'Nilo-Saharan',   color: '#9C640C' },
  'Khoisan':        { label: 'Khoisan',        color: '#7F8C8D' },
  'Uralic':         { label: 'Uralic',         color: '#5D6D7E' },
  'Caucasian':      { label: 'Caucasian',      color: '#34495E' },
  'Amerindian':     { label: 'Amerindian',     color: '#8E44AD' }, // Mesoamerican, Andean & other Native American
  'Australian':     { label: 'Aboriginal Australian', color: '#BA4A00' },
  'Papuan':         { label: 'Papuan',         color: '#A04000' },
  'Other':          { label: 'Other / various', color: '#95A5A6' },
};

window.FAMILY_TO_PHYLUM = {
  'Italic': 'Indo-European', 'Romance': 'Indo-European', 'Germanic': 'Indo-European',
  'Hellenic': 'Indo-European', 'Celtic': 'Indo-European', 'Slavic': 'Indo-European',
  'Balto-Slavic': 'Indo-European', 'Indo-European': 'Indo-European',
  'Indo-Aryan': 'Indo-European', 'Iranian': 'Indo-European',
  'Dravidian': 'Dravidian',
  'Semitic': 'Afroasiatic', 'Afroasiatic': 'Afroasiatic',
  'Mesopotamian': 'Mesopotamian',
  'Sino-Tibetan': 'Sino-Tibetan', 'Japonic': 'Japonic', 'Koreanic': 'Koreanic',
  'Turkic': 'Turkic', 'Mongolic': 'Mongolic',
  'Austronesian': 'Austronesian', 'Austroasiatic': 'Austroasiatic', 'Tai-Kadai': 'Tai-Kadai',
  'Niger-Congo': 'Niger-Congo', 'Nilo-Saharan': 'Nilo-Saharan', 'Khoisan': 'Khoisan',
  'Uralic': 'Uralic', 'Caucasian': 'Caucasian',
  'Amerindian': 'Amerindian', 'Australian': 'Australian', 'Papuan': 'Papuan',
  '—': 'Other',
};
