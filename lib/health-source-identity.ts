/**
 * COS-935 — Health Connect is the Android Apple Health. Name it that.
 *
 * Vishal, after asking what the difference actually is: "If Samsung Health is
 * just an app, it is not similar to the Apple Health... then I think we should
 * go with the Health Connect."
 *
 * He is right, and COS-930 got this wrong in a subtle way. It labelled the
 * feature "Samsung Health" on a Samsung, reasoning that the brand is what a
 * patient recognises. But the two names are not the same KIND of thing:
 *
 *   Apple Health   is a HUB and an app in one. iOS has a single component.
 *   Health Connect is the hub. It stores what other apps write.
 *   Samsung Health is one of those apps — a recorder, like Apple Watch is on
 *                  iOS. We never called the iOS feature "Apple Watch".
 *
 * So the true counterpart of "Apple Health" on Android is HEALTH CONNECT, and
 * calling it Samsung Health was the same category error as calling the iOS
 * feature Apple Watch. It also promised something we do not do: we never read
 * Samsung Health, we read whatever Health Connect holds — which is Samsung
 * Health, Fitbit, Google Fit and Wear OS together.
 *
 * One name per platform, no manufacturer detection, nothing to keep in sync
 * with a table of OEM apps.
 */
/** The API actually read. Two, ever. */
export type HealthApi = 'healthkit' | 'health-connect' | 'none';

export interface HealthSourceIdentity {
  /** Which API the code talks to. */
  api: HealthApi;
  /**
   * The brand on the patient's device. Goes in button labels and headings —
   * "Apple Health", "Samsung Health", "Health".
   */
  label: string;
  /**
   * How that brand's data reaches us, when it needs saying. Null on iOS.
   * Rendered as supporting copy under the switch, never as the label.
   */
  via: string | null;
  /** True when the label is a real product name rather than the generic word. */
  isBrandedLabel?: boolean;
}

const NONE: HealthSourceIdentity = {
  api: 'none',
  label: 'Health',
  via: null,
};

/**
 * Resolve what to show and what to read.
 *
 * `manufacturer` is accepted and ignored: callers already pass it and removing
 * the parameter would be a churn-y signature change for no behaviour. It is
 * documented as unused so nobody re-introduces OEM branching by "fixing" it.
 */
export function resolveHealthSourceIdentity(
  platformOs: string,
  _manufacturer?: string | null,
): HealthSourceIdentity {
  if (platformOs === 'ios') {
    return {
      api: 'healthkit',
      label: 'Apple Health',
      // HealthKit is not something a patient enables separately, and naming it
      // would introduce a word they have never seen.
      via: null,
      isBrandedLabel: true,
    };
  }

  if (platformOs !== 'android') return NONE;

  return {
    api: 'health-connect',
    label: 'Health Connect',
    /*
     * Still says where the data comes from, because the two-app split is real
     * and is the single most common reason an Android patient sees an empty
     * screen: Samsung Health (or Fitbit, or Google Fit) only reaches Health
     * Connect once the patient turns that sync on inside THAT app. iOS needs
     * no equivalent sentence because Apple Health is both halves at once.
     */
    via: 'Reads from Android Health Connect. Your fitness apps — Samsung Health, Fitbit, Google Fit — need to be set to sync with it.',
    isBrandedLabel: true,
  };
}
