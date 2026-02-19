import { z } from 'zod';

export const syncActionsSchema = z.object({
    actions: z.array(z.object({
        actionType: z.enum([
            'claim_prize',
            'update_profile',
            'send_friend_request',
            'accept_friend_request',
            'purchase_item',
            'unlock_achievement'
        ]),
        actionData: z.any(),
        clientTimestamp: z.string().datetime(),
        metadata: z.object({
            deviceId: z.string(),
            platform: z.string(),
            appVersion: z.string(),
            networkType: z.string().optional()
        })
    })),
    conflictResolution: z.enum(['server_wins', 'client_wins', 'merge', 'manual']).default('server_wins')
});

export const getSyncStatusSchema = z.object({
    since: z.string().datetime().optional()
});
