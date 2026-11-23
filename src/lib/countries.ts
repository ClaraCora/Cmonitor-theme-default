// ISO regions represented on the map (including XK). Keep these codes separate
// from the geometry so country filters can also be used on a collapsed map.
const codes = new Set(`
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR
BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ
EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW
GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY
KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV
MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG
TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA
ZM ZW
`.trim().split(/\s+/))

const aliases: Record<string, string> = {
  UK: "GB", USA: "US", "United States of America": "US", "United Kingdom": "GB",
  "South Korea": "KR", "North Korea": "KP", "Russian Federation": "RU",
  "Czech Republic": "CZ", Türkiye: "TR", "Viet Nam": "VN", Macau: "MO",
  香港: "HK", 中国香港: "HK", "Hong Kong": "HK", 澳门: "MO", 澳門: "MO", 中国澳门: "MO",
  台湾: "TW", 台灣: "TW", 中国台湾: "TW", 中华人民共和国: "CN", 中国大陆: "CN",
}

function nameKey(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")
}

let names: Map<string, string> | undefined

export function normalizeCountry(raw?: string | null): string | null {
  const value = raw?.normalize("NFKC").trim()
  if (!value) return null
  const code = value.toUpperCase()
  if (codes.has(code)) return code

  // The current Hub supplies ISO codes. Build the localised name index only
  // when a node actually supplies a label.
  if (!names) {
    names = new Map()
    if (typeof Intl.DisplayNames === "function") {
      for (const locale of ["zh-CN", "zh-TW", "en"]) {
        const display = new Intl.DisplayNames([locale], { type: "region" })
        for (const region of codes) {
          const label = display.of(region)
          if (label) names.set(nameKey(label), region)
        }
      }
    }
    for (const [label, region] of Object.entries(aliases)) names.set(nameKey(label), region)
  }
  return names.get(nameKey(value)) ?? null
}

const displayNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["zh-CN"], { type: "region", style: "short" })
  : null

/** A concise Chinese label for known regions, preserving an unrecognised label. */
export function regionLabel(raw?: string | null): string {
  const code = normalizeCountry(raw)
  return code ? displayNames?.of(code) ?? code : raw?.trim() || "未知地区"
}
