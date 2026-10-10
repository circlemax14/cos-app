module.exports = function (api) {
  api.cache(true);
  // COS-1276 — do NOT add 'react-native-paper/babel' back (it was here under
  // env.production). @expo/metro-config's transformer restores BABEL_ENV as
  // the string "undefined" after each file, so the plugin ran on roughly every
  // other file per Metro worker. Release bundles then shipped TWO copies of
  // Paper (src/ and lib/module/) with two PortalContexts: the root PaperProvider
  // came from one, most <Portal>s from the other, and those threw "forgot to
  // wrap your root component with Provider" (Sentry COS-APP-G/H/J). Without
  // the plugin every import resolves to one copy. tests/unit/paper-single-copy
  // guards this.
  return {
    presets: ['babel-preset-expo'],
  };
};
