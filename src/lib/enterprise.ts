import type { EnterpriseMeta } from "@/lib/types";

const enterpriseMode = process.env.ENTERPRISE_MODE === "true";
const mongoLicenseAcknowledged = process.env.MONGODB_LICENSE_ACKNOWLEDGED === "true";

export function getEnterpriseMeta(): EnterpriseMeta {
  const requiresAck = enterpriseMode || process.env.NODE_ENV === "production";

  return {
    mongoLicenseAcknowledged,
    licenseWarning:
      requiresAck && !mongoLicenseAcknowledged
        ? "MongoDB Community Server licensing requires explicit enterprise review. Set MONGODB_LICENSE_ACKNOWLEDGED=true only after internal approval."
        : null,
    optionalCapabilities: ["ics-readonly-sync", "s3-compatible-storage", "oidc-saml-ready"],
  };
}
