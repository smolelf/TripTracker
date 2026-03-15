import 'dotenv/config'

export default {
  "expo": {
    "name": "TripTracker",
    "slug": "TripTracker",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.emmy.triptracker",
    },
    "android": {
      "permissions": [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION" 
      ],
      "package": "com.emmy.triptracker",
      "config": {
        "googleMaps": {
          "apiKey": process.env.GOOGLE_MAPS_API_KEY
        }
      }
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      "expo-sqlite",
      [
        "expo-location",
        {
          "locationAlwaysPermission": "Allow Trip Tracker to track your fare even when the screen is off.",
          "isAndroidForegroundServiceEnabled": true,
          "foregroundService": {
            "notificationTitle": "Trip Tracker is active",
            "notificationBody": "Tracking your trip and calculating fare.",
            "notificationColor": "#2196F3"
          }
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId":  "dfa974d9-3e2e-4d92-a9cd-93066f94a609"
  }}
}
}
