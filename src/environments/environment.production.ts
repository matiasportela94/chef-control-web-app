export const environment = {
  production: true,
  staging: false,
  apiUrl: 'https://api.chefcontrol.app',
  // OAuth Client ID de Google (público). Vacío = no se muestra "Acceder con Google". Ver GOOGLE_CLIENT_ID del back.
  // Vacío a propósito: el dominio de producción no está autorizado en ese client id de Google.
  googleClientId: ''
};
