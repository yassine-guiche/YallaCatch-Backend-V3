import { Document, Types } from 'mongoose';

// Base interfaces
export interface BaseDocument extends Document {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | { [key: string]: JSONValue } | JSONValue[];
export type Metadata = Record<string, unknown>;
export type MongoQuery = Record<string, unknown>;

// Export utility types
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type UpdateFields<T> = DeepPartial<Omit<T, '_id' | 'createdAt' | 'updatedAt'>>;

export type CreateFields<T> = Omit<T, '_id' | 'createdAt' | 'updatedAt'>;

// Database query types
export interface QueryOptions {
    select?: string;
    populate?: string | string[];
    sort?: string | Record<string, 1 | -1>;
    limit?: number;
    skip?: number;
    lean?: boolean;
}

export interface AggregationPipeline {
    $match?: Record<string, any>;
    $group?: Record<string, any>;
    $sort?: Record<string, 1 | -1>;
    $limit?: number;
    $skip?: number;
    $project?: Record<string, any>;
    $lookup?: Record<string, any>;
    $unwind?: string | Record<string, any>;
}
