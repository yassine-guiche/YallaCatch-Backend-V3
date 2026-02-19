export interface GameSessionData {
    deviceId: string;
    platform: 'iOS' | 'Android' | 'Unity';
    version: string;
    deviceModel?: string;
    osVersion?: string;
    appVersion?: string;
    location: {
        latitude: number;
        longitude: number;
        accuracy: number;
    };
}

export interface LocationUpdateData {
    sessionId: string;
    location: {
        latitude: number;
        longitude: number;
        accuracy: number;
        speed?: number;
        heading?: number;
    };
    device?: {
        model?: string;
        osVersion?: string;
        appVersion?: string;
    };
    timestamp: string;
}

export interface PowerUpUsageData {
    powerUpId: string;
    location: {
        latitude: number;
        longitude: number;
    };
}

export interface IGameSession {
    sessionId: string;
    userId: string;
    startTime: string;
    endTime?: string;
    duration?: number;
    deviceId: string;
    platform: 'iOS' | 'Android' | 'Unity';
    version: string;
    initialLocation: {
        latitude: number;
        longitude: number;
        accuracy: number;
    };
    currentLocation: {
        latitude: number;
        longitude: number;
        accuracy: number;
    };
    distanceTraveled: number;
    prizesFound: number;
    claimsAttempted: number;
    powerUpsUsed: number;
    status: string;
}

export interface DailyChallenge {
    id: string;
    title: string;
    description: string;
    type: 'claims' | 'distance' | 'categories';
    target: number;
    progress: number;
    reward: number;
    completed: boolean;
    completedAt?: string;
}
