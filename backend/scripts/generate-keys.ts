#!/usr/bin/env tsx

/**
 * JWT Key Generation Script
 * Generates RSA key pair for JWT token signing and verification
 */

import { generateKeyPair } from 'crypto';
import { promisify } from 'util';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const generateKeyPairAsync = promisify(generateKeyPair);

interface KeyPairOptions {
  keySize?: number;
  outputDir?: string;
  format?: 'pem' | 'base64';
}

/**
 * Generate RSA key pair for JWT signing
 */
async function generateJWTKeys(options: KeyPairOptions = {}) {
  const {
    keySize = 2048,
    outputDir = './keys',
    format = 'base64'
  } = options;

  console.log('🔐 Generating JWT RSA key pair...');
  console.log(`   Key size: ${keySize} bits`);
  console.log(`   Output directory: ${outputDir}`);
  console.log(`   Format: ${format}`);

  try {
    // Generate RSA key pair
    const { privateKey, publicKey } = await generateKeyPairAsync('rsa', {
      modulusLength: keySize,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Save keys in PEM format
    const privateKeyPath = join(outputDir, 'jwt-private.pem');
    const publicKeyPath = join(outputDir, 'jwt-public.pem');
    
    writeFileSync(privateKeyPath, privateKey);
    writeFileSync(publicKeyPath, publicKey);

    console.log('✅ Keys generated successfully!');
    console.log(`   Private key: ${privateKeyPath}`);
    console.log(`   Public key: ${publicKeyPath}`);

    // Generate base64 encoded versions for environment variables
    const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
    const publicKeyBase64 = Buffer.from(publicKey).toString('base64');

    // Save base64 versions
    const envFilePath = join(outputDir, 'jwt-keys.env');
    const envContent = `# JWT Keys for Environment Variables
# Add these to your .env file

JWT_PRIVATE_KEY_BASE64=${privateKeyBase64}
JWT_PUBLIC_KEY_BASE64=${publicKeyBase64}

# Alternative: Use file paths (not recommended for production)
# JWT_PRIVATE_KEY_PATH=${privateKeyPath}
# JWT_PUBLIC_KEY_PATH=${publicKeyPath}
`;

    writeFileSync(envFilePath, envContent);

    console.log(`   Environment file: ${envFilePath}`);
    console.log('');
    console.log('📋 Environment Variables:');
    console.log('');
    console.log(`JWT_PRIVATE_KEY_BASE64=${privateKeyBase64}`);
    console.log('');
    console.log(`JWT_PUBLIC_KEY_BASE64=${publicKeyBase64}`);
    console.log('');
    console.log('⚠️  Security Notes:');
    console.log('   - Keep the private key secure and never commit it to version control');
    console.log('   - The public key can be shared safely');
    console.log('   - Use environment variables in production');
    console.log('   - Consider using a key management service for production');

    return {
      privateKey,
      publicKey,
      privateKeyBase64,
      publicKeyBase64
    };

  } catch (error) {
    console.error('❌ Error generating keys:', error);
    process.exit(1);
  }
}

/**
 * Validate existing JWT keys
 */
async function validateJWTKeys(privateKeyBase64: string, publicKeyBase64: string) {
  console.log('🔍 Validating JWT keys...');

  try {
    const jwt = await import('jsonwebtoken');
    
    // Decode base64 keys
    const privateKey = Buffer.from(privateKeyBase64, 'base64').toString();
    const publicKey = Buffer.from(publicKeyBase64, 'base64').toString();

    // Test signing and verification
    const testPayload = {
      sub: 'test-user',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };

    // Sign token
    const token = jwt.sign(testPayload, privateKey, {
      algorithm: 'RS256',
      issuer: 'yallacatch-test'
    });

    // Verify token
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'yallacatch-test'
    });

    console.log('✅ JWT keys are valid!');
    console.log('   Test token signed and verified successfully');
    
    return true;

  } catch (error) {
    console.error('❌ JWT key validation failed:', error);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'generate';

  switch (command) {
    case 'generate':
      const keySize = parseInt(args[1]) || 2048;
      const outputDir = args[2] || './keys';
      
      await generateJWTKeys({ keySize, outputDir });
      break;

    case 'validate':
      const privateKeyBase64 = process.env.JWT_PRIVATE_KEY_BASE64;
      const publicKeyBase64 = process.env.JWT_PUBLIC_KEY_BASE64;

      if (!privateKeyBase64 || !publicKeyBase64) {
        console.error('❌ JWT_PRIVATE_KEY_BASE64 and JWT_PUBLIC_KEY_BASE64 environment variables are required');
        process.exit(1);
      }

      const isValid = await validateJWTKeys(privateKeyBase64, publicKeyBase64);
      process.exit(isValid ? 0 : 1);
      break;

    case 'help':
    default:
      console.log(`
🔐 JWT Key Generation and Validation Tool

Usage:
  npm run generate-keys [command] [options]

Commands:
  generate [keySize] [outputDir]  Generate new JWT key pair (default)
  validate                       Validate existing JWT keys from environment
  help                          Show this help message

Examples:
  npm run generate-keys                    # Generate 2048-bit keys in ./keys
  npm run generate-keys generate 4096     # Generate 4096-bit keys in ./keys
  npm run generate-keys generate 2048 ./secrets  # Generate keys in ./secrets
  npm run generate-keys validate          # Validate keys from environment

Environment Variables (for validation):
  JWT_PRIVATE_KEY_BASE64  Base64 encoded private key
  JWT_PUBLIC_KEY_BASE64   Base64 encoded public key
`);
      break;
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { generateJWTKeys, validateJWTKeys };
