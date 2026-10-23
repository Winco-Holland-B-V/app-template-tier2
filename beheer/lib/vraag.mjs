/**
 * Eén HTTP-aanroep naar een beheer-API (Cloudflare of Supabase), met de sleutel als
 * Bearer-token. Een fout noemt altijd methode, endpoint en status, zodat je in het
 * logboek van de workflow meteen ziet welke stap stopte; de query-string (en dus een
 * eventuele `reveal=true`) valt eruit, de sleutel komt er nooit in.
 *
 * Een `FormData`-body (multipart, zoals het uploaden van een Worker-script) gaat
 * ongewijzigd mee en zonder Content-Type: fetch zet dan zelf multipart/form-data met de
 * boundary. Elke andere body gaat als JSON.
 */
export async function vraag(fetchFn, url, { methode = "GET", token, body } = {}) {
  const multipart = body instanceof FormData;
  const antwoord = await fetchFn(url, {
    method: methode,
    headers: multipart
      ? { Authorization: `Bearer ${token}` }
      : { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  const tekst = await antwoord.text();
  let data = null;
  try {
    data = tekst ? JSON.parse(tekst) : null;
  } catch {
    data = { ruw: tekst.slice(0, 200) };
  }
  if (!antwoord.ok) {
    const cloudflare = Array.isArray(data?.errors)
      ? data.errors
          .map((e) => e?.message)
          .filter(Boolean)
          .join("; ")
      : "";
    const melding =
      cloudflare ||
      data?.message ||
      data?.msg ||
      data?.error?.message ||
      data?.ruw ||
      antwoord.statusText;
    const fout = new Error(
      `${methode} ${new URL(url).pathname} gaf ${antwoord.status}: ${melding}`,
    );
    fout.status = antwoord.status;
    throw fout;
  }
  return data;
}

/** Wachten, als aparte functie zodat de tests hem kunnen vervangen. */
export function wacht(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
