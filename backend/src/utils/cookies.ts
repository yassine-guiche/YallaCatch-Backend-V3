type CookieOptions = {
    maxAge?: number;
    domain?: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
};

export function parseCookies(header?: string): Record<string, string> {
    if (!header) return {};
    return header.split(';').reduce((acc, part) => {
        const [rawName, ...rawValue] = part.trim().split('=');
        if (!rawName) return acc;
        const value = rawValue.join('=');
        acc[rawName] = decodeURIComponent(value || '');
        return acc;
    }, {} as Record<string, string>);
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    parts.push(`Path=${options.path || '/'}`);
    if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
    if (options.domain) parts.push(`Domain=${options.domain}`);
    if (options.httpOnly) parts.push('HttpOnly');
    if (options.secure) parts.push('Secure');
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    return parts.join('; ');
}
