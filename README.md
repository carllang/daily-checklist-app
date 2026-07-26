# Daily Checklist

A simple daily task checklist app built with Expo (React Native).

## Features

- Add, complete, and delete tasks
- Drag to reorder tasks
- Progress bar with completion percentage
- Light and dark theme (persisted between sessions)
- All data stored locally on device — no account or internet required

## Tech

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) / React Native 0.86
- `expo-file-system` for local persistence
- `react-native-safe-area-context` for safe area handling
- No backend, no auth, no external APIs

## Getting Started

```bash
npm install
npx expo start
```

Scan the QR code with [Expo Go](https://expo.dev/go) to run on your device.

## Building for Production

```bash
npm install -g eas-cli
eas build --platform android
```
