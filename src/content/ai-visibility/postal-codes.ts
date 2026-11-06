import type { NorthernCyprusDistrict } from "@/features/locations/northern-cyprus-districts";

import { COUNTRY_CODE, regionNames } from "@/content/ai-visibility/site";

/**
 * Official postal codes of the Turkish Republic of Northern Cyprus (KKTC).
 *
 * Source: KKTC Posta Dairesi Müdürlüğü, "K.K.T.C. Posta Kodları" —
 * http://posta.gov.ct.tr (published PDF, md5 `c2f9e86093a381e9db4782498581c203`).
 * The island's south uses the Republic of Cyprus system, which does not apply
 * here; these 5-digit codes are the ones the KKTC postal authority publishes and
 * the ones `JobPosting.jobLocation.address.postalCode` should carry.
 *
 * A vacancy is recorded only at district granularity, so a listing can honestly
 * claim its district's town-centre code. Codes for a sub-district locality are
 * deliberately not encoded: "Alsancak", for example, is split across 99350
 * (mahalle) and 99360 (köy) in the table, and nothing in a listing says which
 * one applies, so asserting either would be a guess. `99000` is the
 * country-level code the table labels "ÜLKE KODU".
 */
export const KKTC_COUNTRY_POSTAL_CODE = "99000";

const districtPostalCodes = new Map<NorthernCyprusDistrict, string>([
  ["Lefkoşa", "99010"],
  ["Mağusa", "99450"],
  ["Girne", "99300"],
  ["Güzelyurt", "99700"],
  ["İskele", "99850"],
  ["Lefke", "99770"],
]);

/**
 * A district name, or null when it is absent or blank. A padded value is
 * trimmed so a stored `" Girne "` still resolves to its code, and a whitespace
 * string is the same absence as `null` rather than a name of its own.
 */
function normalizeDistrict(district: string | null | undefined): string | null {
  const trimmed = district?.trim();
  return trimmed ? trimmed : null;
}

/** The official town-centre postal code of a district, or null if unknown. */
export function districtPostalCode(
  district: string | null | undefined,
): string | null {
  const named = normalizeDistrict(district);
  return named
    ? (districtPostalCodes.get(named as NorthernCyprusDistrict) ?? null)
    : null;
}

/**
 * The `jobLocation.address` a `JobPosting` carries, kept here rather than in the
 * `server-only` producer so the shape is directly testable.
 *
 * A vacancy is recorded only at district granularity, so the address names the
 * district as both locality and region and claims that district's own code. It
 * deliberately omits `streetAddress`: no listing holds a street, and a guessed
 * one would point Google Jobs at the wrong place (Google's JobPosting policy
 * forbids "false location data"). Only `addressCountry` is required, so the
 * omission leaves the posting valid.
 *
 * With no district the address falls back to the country: locality and region
 * become the country name and the code the country-level one, so the three parts
 * stay consistent instead of mixing a country name with a district's code. A
 * blank district counts as none, so an empty string cannot emit an empty
 * `addressLocality` beside a country-level code.
 */
export function jobLocationPostalAddress(district: string | null) {
  const named = normalizeDistrict(district);
  const postalCode = districtPostalCode(named) ?? KKTC_COUNTRY_POSTAL_CODE;
  return {
    "@type": "PostalAddress",
    addressLocality: named ?? regionNames.tr,
    addressRegion: named ?? regionNames.tr,
    postalCode,
    addressCountry: COUNTRY_CODE,
  };
}

