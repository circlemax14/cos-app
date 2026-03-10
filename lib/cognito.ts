import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js';

const userPool = new CognitoUserPool({
  UserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID ?? '',
  ClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? '',
});

export interface CognitoTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

/**
 * Sign in with Cognito using username + password.
 * Returns access, refresh, and ID tokens on success.
 */
export function cognitoSignIn(username: string, password: string): Promise<CognitoTokens> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: username, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: username, Password: password });

    user.authenticateUser(authDetails, {
      onSuccess(session) {
        resolve({
          accessToken: session.getAccessToken().getJwtToken(),
          refreshToken: session.getRefreshToken().getToken(),
          idToken: session.getIdToken().getJwtToken(),
        });
      },
      onFailure(err) {
        reject(err);
      },
      newPasswordRequired(_userAttributes, _requiredAttributes) {
        reject(new Error('NEW_PASSWORD_REQUIRED'));
      },
    });
  });
}

/**
 * Refresh tokens using the stored refresh token.
 */
export function refreshCognitoTokens(
  username: string,
  refreshToken: string,
): Promise<Pick<CognitoTokens, 'accessToken' | 'idToken'>> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: username, Pool: userPool });
    const token = new CognitoRefreshToken({ RefreshToken: refreshToken });

    user.refreshSession(token, (err, session) => {
      if (err) return reject(err);
      resolve({
        accessToken: session.getAccessToken().getJwtToken(),
        idToken: session.getIdToken().getJwtToken(),
      });
    });
  });
}

/**
 * Sign out the current Cognito user (local session only).
 */
export function cognitoSignOut(): void {
  const user = userPool.getCurrentUser();
  user?.signOut();
}
