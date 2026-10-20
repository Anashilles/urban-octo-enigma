import { z } from "zod";

export const MAX_TOUR_STOPS = 40;

export const tourSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).default(""),
  stops: z
    .array(
      z.object({
        frameId: z.string().min(1).max(64),
        note: z.string().trim().max(500).default(""),
      }),
    )
    .min(1)
    .max(MAX_TOUR_STOPS),
});
export type TourInput = z.input<typeof tourSchema>;
