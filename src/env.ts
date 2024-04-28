import { z } from "zod";

const envSchema = z.object({
  IMAGE_BUCKET: z.string(),
  ALLOWED_HOSTS: z.string(),
  DEFAULT_DOMAIN: z.string(),
});

export type Environment = z.infer<typeof envSchema>;

export function validateEnv(environment: unknown) {
  return envSchema.parse(environment);
}
