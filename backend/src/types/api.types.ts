// API Request/Response types
export interface PaginationQuery {
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    timestamp: string;
}

export interface ErrorResponse {
    success: false;
    error: string;
    message: string;
    code?: string;
    details?: Record<string, any>;
    timestamp: string;
}
