// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // SCRUM-361 / HIPAA audit CRITICAL #4: prevent direct OpenAI integration
      // from re-entering the client. EXPO_PUBLIC_* env vars are inlined into the
      // public JS bundle, and api.openai.com is not BAA-covered.
      // Use the cos-backend AI service (Bedrock-backed) instead.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/openai*', '**/openai/*', 'openai'],
              message:
                'Direct OpenAI integration is not BAA-covered. Use the cos-backend AI service (Bedrock-backed) instead.',
            },
          ],
        },
      ],
    },
  },
]);
