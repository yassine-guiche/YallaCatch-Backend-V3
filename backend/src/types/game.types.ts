import { UserLevel } from './enums.js';

// Geolocation types
export interface Coordinates {
    lat: number;
    lng: number;
}

export interface BoundingBox {
    north: number;
    south: number;
    east: number;
    west: number;
}

export interface GeofenceArea {
    center: Coordinates;
    radius: number;
}

// Game mechanics types
export interface LevelRequirements {
    level: UserLevel;
    pointsRequired: number;
    benefits: string[];
}

export interface DailyChallenge {
    id: string;
    title: string;
    description: string;
    target: number;
    reward: number;
    type: 'claims' | 'distance' | 'time' | 'city';
    expiresAt: Date;
}

export interface Achievement {
    id: string;
    title: string;
    description: string;
    icon: string;
    requirement: Record<string, any>;
    reward: number;
    isSecret: boolean;
}
