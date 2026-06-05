export type CampaignAttribution = {
  landingPath?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmMedium?: string;
  utmSource?: string;
  utmTerm?: string;
};

export const pilotAnalyticsEventNames = [
  "Pilot Request Attempted",
  "Pilot Request Failed",
  "Pilot Request Received",
  "Pilot Request Submitted",
] as const;

export const pilotAnalyticsPropertyKeys = [
  "campaignMedium",
  "campaignName",
  "campaignSource",
  "hasCampaignAttribution",
  "hasMessage",
  "hasName",
  "mode",
  "segment",
  "status",
] as const;

export function hasPilotCampaignAttribution(attribution: CampaignAttribution) {
  return Boolean(
    attribution.utmSource ||
      attribution.utmMedium ||
      attribution.utmCampaign ||
      attribution.utmContent ||
      attribution.utmTerm,
  );
}

export function pilotCampaignAnalyticsProperties(
  attribution: CampaignAttribution,
) {
  const properties: Record<string, string | boolean> = {
    hasCampaignAttribution: hasPilotCampaignAttribution(attribution),
  };

  if (attribution.utmSource) {
    properties.campaignSource = attribution.utmSource;
  }

  if (attribution.utmMedium) {
    properties.campaignMedium = attribution.utmMedium;
  }

  if (attribution.utmCampaign) {
    properties.campaignName = attribution.utmCampaign;
  }

  return properties;
}
