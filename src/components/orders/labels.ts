export const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "in_person", label: "In person" },
  { value: "other", label: "Other" },
];
export const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "whish", label: "Whish" },
  { value: "omt", label: "OMT" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "courier_cod", label: "Courier cash on delivery" },
  { value: "other", label: "Other" },
];
export const channelLabel = (v: string) => CHANNELS.find((c) => c.value === v)?.label ?? v;
export const methodLabel = (v: string) => METHODS.find((c) => c.value === v)?.label ?? v;
