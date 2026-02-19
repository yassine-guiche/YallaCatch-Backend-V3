import { adminAccounts } from '../lib/mockData';

const mockApiService = {
    async mockRequest(endpoint, options = {}) {
        console.log('[MockAPI] Request:', endpoint, options);

        const method = options.method || 'GET';
        const body = options.body ? JSON.parse(options.body) : {};

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // Auth Login
        if ((endpoint === '/auth/login' || endpoint === '/auth/partner-login') && method === 'POST') {
            const user = adminAccounts.find(u => u.email === body.email && u.password === body.password);

            if (user) {
                return {
                    success: true,
                    user,
                    tokens: {
                        accessToken: 'mock_access_token_' + Date.now(),
                        refreshToken: 'mock_refresh_token_' + Date.now()
                    }
                };
            }

            throw {
                status: 401,
                message: 'Identifiants incorrects (Mock)'
            };
        }

        // Auth Me
        if (endpoint === '/auth/me') {
            return {
                success: true,
                user: adminAccounts[0] // Default to super admin
            };
        }

        // Default generic success for other endpoints
        if (method === 'GET') {
            return {
                success: true,
                data: [],
                total: 0,
                page: 1,
                limit: 20
            };
        }

        return { success: true };
    }
};

export default mockApiService;
