// Telegram WebApp validation helper
// This script helps validate the data received from Telegram WebApp

(function () {
  // Log WebApp initialization
  console.log('Telegram WebApp validator loaded');

  // Check if we're in a Telegram WebApp
  if (window.Telegram && window.Telegram.WebApp) {
    const webApp = window.Telegram.WebApp;

    // Log initialization data (without sensitive parts)
    console.log('WebApp initialized with platform:', webApp.platform);
    console.log('WebApp color scheme:', webApp.colorScheme);
    console.log('WebApp theme params available:', !!webApp.themeParams);

    // Check if user data is available
    if (webApp.initDataUnsafe && webApp.initDataUnsafe.user) {
      console.log('User data available:', {
        id: webApp.initDataUnsafe.user.id,
        username: webApp.initDataUnsafe.user.username,
        has_photo: !!webApp.initDataUnsafe.user.photo_url,
      });
    } else {
      console.warn('No user data available in WebApp');
    }

    // Add event listener for viewport changes
    window.addEventListener('resize', () => {
      console.log('WebApp viewport changed:', {
        height: webApp.viewportHeight,
        stableHeight: webApp.viewportStableHeight,
        isExpanded: webApp.isExpanded,
      });
    });

    // Notify when ready
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM loaded, notifying Telegram WebApp we are ready');
      webApp.ready();
    });
  } else {
    console.warn('Not running in Telegram WebApp environment');
  }
})();
