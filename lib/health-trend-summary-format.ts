/**
 * COS-1133 — splitting the summary prose into Ken's three domains.
 *
 * Pure, and in lib rather than beside the card, for two reasons: `node --test`
 * cannot transform a module that imports react-native, so a function living in
 * the component is a function that cannot be tested; and the parsing rule here
 * is a contract with the PROMPT — the model is told to emit each domain name
 * on its own line precisely so this can find them.
 */

/** Exactly the headings health-trend-summary.service instructs the model to emit. */
export const TREND_DOMAINS = ['Biological', 'Psychological', 'Social / Faith'] as const;

export interface TrendSection {
  heading: string | null;
  body: string;
}

export function splitDomains(text: string): TrendSection[] {
  const out: TrendSection[] = [];
  let heading: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    if (heading || body) out.push({ heading, body });
    buf = [];
  };

  for (const raw of (text ?? '').split('\n')) {
    /*
     * A heading is the domain name ALONE on its line. Matching it anywhere
     * would split "Biological markers are stable" in half and leave the
     * sentence as a heading with no body.
     */
    const line = raw.trim();
    if ((TREND_DOMAINS as readonly string[]).includes(line)) {
      flush();
      heading = line;
      continue;
    }
    buf.push(raw);
  }
  flush();
  return out;
}
