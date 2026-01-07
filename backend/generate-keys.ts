import crypto from 'crypto';

/**
 * Generate RSA key pair for JWT signing
 * This script creates a new RSA key pair and outputs them in the format expected by the application
 */
function generateRSAKeyPair(): { publicKey: string, privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Convert to base64 as expected by the configuration
  const publicKeyBase64 = publicKey.toString('base64');
  const privateKeyBase64 = privateKey.toString('base64');

  return {
    publicKey: publicKeyBase64,
    privateKey: privateKeyBase64
  };
}

// Generate and display the key pair
try {
  console.log('🔐 Generating new RSA key pair for JWT signing...\n');

  const { publicKey, privateKey } = generateRSAKeyPair();

  console.log('📋 Please update your .env file with these values:\n');
  console.log(`JWT_PRIVATE_KEY_BASE64=${privateKey}`);
  console.log(`JWT_PUBLIC_KEY_BASE64=${publicKey}`);
  console.log('\n⚠️  IMPORTANT: Keep these keys secure and do not commit them to version control!\n');

  console.log('📋 Example .env configuration:');
  console.log('# JWT Configuration');
  console.log('# Generate your own keys with: npm run generate-keys');
  console.log('JWT_PRIVATE_KEY_BASE64=-----BEGIN PRIVATE KEY-----');
  console.log(privateKey.match(/.{1,65}/g)?.join('\n') || privateKey);
  console.log('-----END PRIVATE KEY-----');
  console.log('JWT_PUBLIC_KEY_BASE64=-----BEGIN PUBLIC KEY-----');
  console.log(publicKey.match(/.{1,65}/g)?.join('\n') || publicKey);
  console.log('-----END PUBLIC KEY-----');

} catch (error) {
  console.error('❌ Error generating key pair:', error);
  process.exit(1);
}