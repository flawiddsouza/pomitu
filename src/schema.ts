import { z } from 'zod'

export const configSchema = z.object({
    apps: z.array(
        z.object({
            name: z.string(),
            cwd: z.string(),
            run: z.string(),
            env: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
        })
    ),
})
