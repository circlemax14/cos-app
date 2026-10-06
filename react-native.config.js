// COS-928 — native Google sign-in is Android-only. iOS keeps its working
// expo-auth-session flow, so the iOS binary must not link (or ship) this pod:
// linking it would change the iOS native fingerprint without a reason.
module.exports = {
  dependencies: {
    '@react-native-google-signin/google-signin': {
      platforms: { ios: null },
    },
  },
};
