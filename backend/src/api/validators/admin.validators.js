const { z } = require('zod');

const createVenueSchema = z.object({
  name: z.string().min(1, 'Venue name is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  layoutConfig: z.object({
    sections: z.array(z.object({
      name: z.enum(['REGULAR', 'VIP', 'PREMIUM']),
      rows: z.array(z.object({
        row: z.string().min(1, 'Row label is required'),
        seatsCount: z.number().int().min(1).max(100),
      })),
    })),
  }),
});

const createEventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  venueId: z.string().uuid('Invalid venue ID'),
  startsAt: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid date format'),
  endsAt: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid date format'),
  pricing: z.object({
    REGULAR: z.number().min(0).optional().default(50),
    VIP: z.number().min(0).optional().default(150),
    PREMIUM: z.number().min(0).optional().default(300),
  }).optional().default({ REGULAR: 50, VIP: 150, PREMIUM: 300 }),
});

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startsAt: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid date format').optional(),
  endsAt: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid date format').optional(),
});

module.exports = { createVenueSchema, createEventSchema, updateEventSchema };
