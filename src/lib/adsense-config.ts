/**
 * Shared AdSense configuration and validation. Publisher and slot IDs are
 * public identifiers copied from the supplied AdSense snippet; they are not
 * secrets. These defaults activate the supplied ad unit in every environment;
 * valid NEXT_PUBLIC_* values can override them.
 */
const DEFAULT_ADSENSE_PUBLISHER_ID = "ca-pub-6344164153032042";
const DEFAULT_ADSENSE_SLOT_BEAT_DETAIL = "2720963809";

export function validAdSensePublisherId(value?: string | null): string | null {
  const publisherId = value?.trim();
  if (!publisherId || !/^ca-pub-\d{16}$/.test(publisherId)) return null;
  if (publisherId === "ca-pub-0000000000000000") return null;
  return publisherId;
}

export function validAdSenseSlotId(value?: string | null): string | null {
  const slotId = value?.trim();
  if (!slotId || !/^\d+$/.test(slotId)) return null;
  return slotId;
}

export function configuredAdSensePublisherId(value?: string | null): string | null {
  const configured =
    validAdSensePublisherId(value) ??
    validAdSensePublisherId(process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID);
  return configured ?? DEFAULT_ADSENSE_PUBLISHER_ID;
}

export function configuredAdSenseSlotId(value?: string | null): string | null {
  const configured =
    validAdSenseSlotId(value) ??
    validAdSenseSlotId(process.env.NEXT_PUBLIC_ADSENSE_SLOT_BEAT_DETAIL);
  return configured ?? DEFAULT_ADSENSE_SLOT_BEAT_DETAIL;
}
