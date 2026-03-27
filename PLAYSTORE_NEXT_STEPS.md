# Expense AI Play Store Path

## Current status

- Web app works
- Backend works
- Android app works in emulator
- Capacitor wrapper is created

## Before Play Store

1. Host the backend online
2. Replace local API URL with your hosted HTTPS URL
3. Test the Android app on a real phone
4. Build a signed release bundle
5. Create Play Console listing

## Hosting note

The backend currently stores data in local files. That is okay for development, but for public users the next upgrade should be a real hosted database.

## Quick deploy direction

- Backend host: Render
- Next backend upgrade: move storage from JSON file to a production database
- Android app: update API URL to the hosted backend domain
