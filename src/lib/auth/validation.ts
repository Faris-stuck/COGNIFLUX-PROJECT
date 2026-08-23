import { z } from "zod";

/**
 * Shared validation schemas. Error messages are intentionally generic on the
 * auth side to prevent account enumeration; field-level rules live here only.
 */

export const EmailSchema = z.string().trim().toLowerCase().email().max(254);

export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128)
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), {
    message: "Password must contain at least one letter and one number.",
  });

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});

export const ProfileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  locale: z.enum(["id", "en"]).optional(),
  level: z
    .enum(["elementary", "middle", "high", "vocational", "university", "researcher"])
    .nullable()
    .optional(),
  interests: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

export const SavePaperSchema = z.object({
  paperKey: z.string().trim().min(3).max(200),
  work: z.record(z.string(), z.unknown()).optional(),
});

export const CollectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const NoteCreateSchema = z.object({
  paperKey: z.string().trim().max(200).nullable().optional(),
  collectionId: z.coerce.number().int().positive().nullable().optional(),
  body: z.string().trim().min(1).max(10_000),
});

export const NoteUpdateSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

export const HighlightCreateSchema = z.object({
  paperKey: z.string().trim().min(3).max(200),
  text: z.string().trim().min(1).max(5_000),
  note: z.string().trim().max(2_000).nullable().optional(),
  sectionAnchor: z.string().trim().max(200).nullable().optional(),
  color: z.enum(["yellow", "green", "blue"]).default("yellow"),
});
