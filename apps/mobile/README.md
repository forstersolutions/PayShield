# PayShield Mobile

The PayShield customer product is a native Expo application for iOS and
Android. The website at `payshield-lime.vercel.app` is the store-download
gateway and authenticated API facade; it is not the customer dashboard.

## Local development

Requirements: Node.js 22, npm 10, Xcode 26 for iOS, and Android Studio for
Android.

```bash
npm ci
cp .env.example .env.local
npm run prebuild -- --clean
npm run ios
```

Use `npm run android` for Android. Native development builds are required for
Plaid Link and RevenueCat purchases; Expo Go does not include those modules.

## Configuration

Public build variables are documented in `.env.example`. Production builds
require:

- Clerk publishable key and native sign-in configuration.
- RevenueCat Apple and Google public SDK keys, a `payshield_pro` entitlement,
  and the monthly `payshield_monthly` package.
- The production PayShield API URL.
- Apple and Google signing/store accounts configured in EAS.

Provider secrets, private keys, ledger credentials, and Plaid secrets never go
into the native bundle. They remain in the dedicated PayShield core service.

## Verification and release

```bash
npm run verify
npm run build:ios
npm run build:android
npm run submit:ios
npm run submit:android
```

Store metadata and release tooling live under `store/` and `fastlane/`.
