import { z } from 'zod'

export const configSchema = z.object({
    apps: z.array(
        z.object({
            name: z.string(),
            cwd: z.string(),
            run: z.string(),
        })
    ),
})
