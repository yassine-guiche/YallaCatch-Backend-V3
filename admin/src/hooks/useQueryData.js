import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Custom hook for fetching data with react-query caching
 * @param {string} queryKey - Unique key for the query (e.g., 'users', 'prizes')
 * @param {Function} fetchFn - Function that returns a promise with the data
 * @param {Object} options - Additional react-query options
 */
export function useQueryData(queryKey, fetchFn, options = {}) {
  return useQuery({
    queryKey: Array.isArray(queryKey) ? queryKey : [queryKey],
    queryFn: fetchFn,
    staleTime: options.staleTime ?? 5 * 60 * 1000, // 5 minutes
    gcTime: options.gcTime ?? 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 1,
    ...options,
  });
}

/**
 * Custom hook for mutations with automatic cache invalidation
 * @param {Function} mutationFn - Function that performs the mutation
 * @param {string|string[]} invalidateKeys - Query keys to invalidate on success
 * @param {Object} options - Additional options
 */
export function useMutationWithInvalidation(mutationFn, invalidateKeys, options = {}) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn,
    onSuccess: (data, variables, context) => {
      // Invalidate related queries
      const keys = Array.isArray(invalidateKeys) ? invalidateKeys : [invalidateKeys];
      keys.forEach(key => {
        queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
      });
      
      // Call custom onSuccess if provided
      options.onSuccess?.(data, variables, context);
    },
    onError: options.onError,
    ...options,
  });
}

/**
 * Hook to get the query client for manual cache operations
 */
export function useQueryClientInstance() {
  return useQueryClient();
}

/**
 * Pre-built query keys for common entities
 */
export const queryKeys = {
  users: (filters) => ['users', filters],
  user: (id) => ['user', id],
  prizes: (filters) => ['prizes', filters],
  rewards: (filters) => ['rewards', filters],
  analytics: (type, params) => ['analytics', type, params],
  notifications: (filters) => ['notifications', filters],
  achievements: (filters) => ['achievements', filters],
  powerups: (filters) => ['powerups', filters],
  promoCodes: (filters) => ['promoCodes', filters],
  partners: (filters) => ['partners', filters],
  reports: (filters) => ['reports', filters],
  settings: () => ['settings'],
  dashboard: () => ['dashboard'],
  activityLogs: (filters) => ['activityLogs', filters],
};

export default useQueryData;
