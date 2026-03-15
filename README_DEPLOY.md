# Deployment Guide

This project is set up for Web (PWA) and Mobile (Android/iOS) deployment.

## Web Deployment (Vercel / Hostinger)

### Vercel
1. Push your code to GitHub/GitLab/Bitbucket.
2. Connect your repository to [Vercel](https://vercel.com).
3. Set your environment variables (e.g., `GEMINI_API_KEY`) in the Vercel dashboard.
4. Vercel will automatically detect the Vite project and deploy it.

### Hostinger (or any shared hosting)
1. Run `npm run build`.
2. Upload the contents of the `dist/` folder to your Hostinger `public_html` directory via FTP or File Manager.
3. Ensure you have an `.htaccess` file if you use React Router (the project doesn't seem to use it yet, but it's good practice).

## Mobile Deployment (Capacitor)

### Prerequisites
- For Android: [Android Studio](https://developer.android.com/studio)
- For iOS: [Xcode](https://developer.apple.com/xcode/) (Requires a Mac)

### Build & Sync
Every time you make changes to the web code, run:
```bash
npm run build:mobile
```

### Open Native Projects
To open the project in Android Studio:
```bash
npm run android:open
```

To open the project in Xcode:
```bash
npm run ios:open
```

## Features added for Deployment
- **Vite PWA Plugin**: Automatically generates a manifest and service worker for offline support and "Add to Home Screen" on mobile web.
- **Capacitor**: Wraps your web app as a native app for Android and iOS.
- **Vercel Config**: Includes `vercel.json` for proper routing.
- **Environment Handling**: Configured `vite.config.ts` to use Gemini API keys safely from environment variables.

## Assets
Make sure to add the following icons in the `public/` folder:
- `favicon.ico`
- `pwa-192x192.png`
- `pwa-512x512.png`
- `apple-touch-icon.png`
- `mask-icon.svg`
