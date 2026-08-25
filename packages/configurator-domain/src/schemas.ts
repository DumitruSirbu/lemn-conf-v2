import { z } from "zod";

export const ConfigurationTimestampSchema = z.iso.datetime({
  offset: true,
  precision: 3,
});

export const ContactDataSchema = z.strictObject({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.email().optional(),
});
export type ContactData = z.infer<typeof ContactDataSchema>;
