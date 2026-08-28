# PayShield Security Patch

This package vendors the MIT-licensed `image-size` 1.2.1 distribution required
by Metro and applies bounded offset advancement for:

- GHSA-w3rx-r6r6-pgpr (ICNS zero-length entries)
- GHSA-5p2g-fcmc-qvqq (JXL and HEIF zero-length boxes)

The package version is intentionally marked `2.0.3-payshield.0` to distinguish
this reviewed build from upstream releases. `scripts/verify-image-size.mjs`
checks the vendored and installed parser guards on every mobile verification.
