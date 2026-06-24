export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  wsUrl: import.meta.env.VITE_WS_URL ?? "ws://localhost:3001",
  // Local: cognito-local endpoint (http://localhost:9229).
  // AWS: Cognito IDP service endpoint (https://cognito-idp.{region}.amazonaws.com).
  cognitoUrl: import.meta.env.VITE_COGNITO_URL ?? "http://localhost:9229",
  cognitoClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? "",
  cognitoPoolId: import.meta.env.VITE_COGNITO_POOL_ID ?? "",
};

export const LANGUAGES = [
  "English",
  "Spanish",
  "Vietnamese",
  "Chinese",
  "Tagalog",
  "Korean",
  "Creole",
];
