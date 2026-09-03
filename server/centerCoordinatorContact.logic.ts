import { normalizeCoordinatorContactDetails } from "./coordinatorContactLogic";

export const CENTER_CONTACT_METHODS = ["Phone", "Email", "Mobile", "Text", "Other"] as const;
export type CenterContactMethod = (typeof CENTER_CONTACT_METHODS)[number];

export function normalizeCenterCoordinatorContact(input: {
  coordinatorName: string;
  phone?: string | null;
  extension?: string | null;
  email?: string | null;
  preferredContactMethod?: string | null;
}) {
  const contact = normalizeCoordinatorContactDetails(input.phone, input.email);
  const preferredContactMethod = CENTER_CONTACT_METHODS.includes(input.preferredContactMethod?.trim() as CenterContactMethod)
    ? input.preferredContactMethod!.trim() as CenterContactMethod
    : null;
  return {
    coordinatorName: input.coordinatorName.trim(),
    phone: contact.phone,
    extension: input.extension?.trim() || null,
    email: contact.email,
    preferredContactMethod,
  };
}
