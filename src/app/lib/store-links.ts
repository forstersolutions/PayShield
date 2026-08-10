const defaultAppStoreSearch =
  "https://apps.apple.com/us/search?term=PayShield%20Grayston%20Technologies";
const defaultPlayStoreSearch =
  "https://play.google.com/store/search?q=PayShield%20Grayston%20Technologies&c=apps";

function safeStoreUrl(value: string | undefined, hostname: string) {
  if (!value?.trim()) return "";

  try {
    const url = new URL(value.trim());

    if (
      url.protocol !== "https:" ||
      url.hostname !== hostname ||
      url.username ||
      url.password
    ) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

export function getStoreLinks() {
  const configuredAppStoreUrl = safeStoreUrl(
    process.env.NEXT_PUBLIC_APP_STORE_URL,
    "apps.apple.com",
  );
  const configuredPlayStoreUrl = safeStoreUrl(
    process.env.NEXT_PUBLIC_PLAY_STORE_URL,
    "play.google.com",
  );

  return {
    appStoreConfigured: Boolean(configuredAppStoreUrl),
    appStoreUrl: configuredAppStoreUrl || defaultAppStoreSearch,
    playStoreConfigured: Boolean(configuredPlayStoreUrl),
    playStoreUrl: configuredPlayStoreUrl || defaultPlayStoreSearch,
  };
}
