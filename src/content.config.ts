import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(5),
    description: z.string().min(30),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    author: z.string().default('Prunus Media'),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    draft: z.boolean().default(true)
  }).refine((value) => !value.image || !!value.imageAlt, {
    message: 'Every article cover image needs alt text'
  })
});

const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    title: z.string().min(3),
    summary: z.string().min(20),
    addedAt: z.coerce.date(), // Date added to the portfolio; NOT the launch date.
    completedAt: z.coerce.date().optional(), // Include only where the build date is confirmed.
    priority: z.number().int().positive().optional(), // Editorial display order for undated work.
    status: z.enum(['live','concept','archived','closed','owned','showcase']).default('showcase'),
    featured: z.boolean().default(false),
    category: z.string().optional(),
    services: z.array(z.string()).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    website: z.string().url().optional(),
    draft: z.boolean().default(true)
  }).refine((value) => !value.image || !!value.imageAlt, {
    message: 'Every project image needs alt text'
  })
});

export const collections = { blog, work };
