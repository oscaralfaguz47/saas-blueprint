import { KbArticleStatus, KbArticleType, KbVisibility } from "@prisma/client";
import { z } from "zod";

import { isValidSlug } from "@/lib/slug";

const slugField = z
  .string()
  .min(1)
  .max(191)
  .refine((s) => isValidSlug(s), "Use lowercase letters, numbers, and single hyphens only.");

export const kbCategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugField,
  description: z.string().trim().max(1000).optional().nullable(),
  icon: z.string().trim().max(80).optional().nullable(),
  sortOrder: z.number().int().min(-2147483648).max(2147483647).default(0),
  isPublished: z.boolean().default(false),
});

export const kbCategoryPatchSchema = kbCategoryCreateSchema.partial();

export const kbArticleListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.nativeEnum(KbArticleStatus).optional(),
  visibility: z.nativeEnum(KbVisibility).optional(),
  articleType: z.nativeEnum(KbArticleType).optional(),
  categoryId: z.string().cuid().optional(),
  isFeatured: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  q: z.string().trim().max(200).optional(),
});

const tagListSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(50)
  .default([]);

export const kbArticleCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  slug: slugField,
  excerpt: z.string().trim().max(500).optional().nullable(),
  categoryId: z.string().cuid(),
  articleType: z.nativeEnum(KbArticleType),
  visibility: z.nativeEnum(KbVisibility),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  bodyMarkdown: z.string().max(500_000),
  tags: tagListSchema,
  status: z.nativeEnum(KbArticleStatus).default(KbArticleStatus.DRAFT),
});

export const kbArticlePatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  slug: slugField.optional(),
  excerpt: z.string().trim().max(500).optional().nullable(),
  categoryId: z.string().cuid().optional(),
  articleType: z.nativeEnum(KbArticleType).optional(),
  visibility: z.nativeEnum(KbVisibility).optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  bodyMarkdown: z.string().max(500_000).optional(),
  tags: tagListSchema.optional(),
});
