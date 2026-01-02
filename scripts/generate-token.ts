#!/usr/bin/env tsx
/**
 * Generate a 32-byte alphanumeric token
 * 
 * Usage:
 *   pnpm generate-token
 *   pnpm generate-token --length 64
 *   pnpm generate-token --format hex
 */

import { randomBytes } from 'crypto';

const ALPHANUMERIC_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const HEX_CHARS = '0123456789abcdef';

function generateAlphanumericToken(length: number): string {
  const bytes = randomBytes(length);
  let token = '';
  
  for (let i = 0; i < bytes.length; i++) {
    token += ALPHANUMERIC_CHARS[bytes[i]! % ALPHANUMERIC_CHARS.length];
  }
  
  return token;
}

function generateHexToken(length: number): string {
  const bytes = randomBytes(Math.ceil(length / 2));
  let token = '';
  
  for (let i = 0; i < bytes.length; i++) {
    token += HEX_CHARS[bytes[i]! >> 4];
    if (token.length < length) {
      token += HEX_CHARS[bytes[i]! & 0x0f];
    }
  }
  
  return token.substring(0, length);
}

function main() {
  const args = process.argv.slice(2);
  
  let length = 32;
  let format: 'alphanumeric' | 'hex' = 'alphanumeric';
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--length' || args[i] === '-l') {
      const lengthArg = args[i + 1];
      if (lengthArg) {
        const parsedLength = parseInt(lengthArg, 10);
        if (!isNaN(parsedLength) && parsedLength > 0) {
          length = parsedLength;
        } else {
          console.error('❌ Invalid length. Must be a positive number.');
          process.exit(1);
        }
        i++; // Skip next argument
      }
    } else if (args[i] === '--format' || args[i] === '-f') {
      const formatArg = args[i + 1];
      if (formatArg === 'hex' || formatArg === 'alphanumeric') {
        format = formatArg;
      } else {
        console.error('❌ Invalid format. Must be "hex" or "alphanumeric".');
        process.exit(1);
      }
      i++; // Skip next argument
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Generate a secure random token

Usage:
  pnpm generate-token [options]

Options:
  --length, -l <number>    Token length in characters (default: 32)
  --format, -f <type>      Token format: "alphanumeric" or "hex" (default: alphanumeric)
  --help, -h               Show this help message

Examples:
  pnpm generate-token
  pnpm generate-token --length 64
  pnpm generate-token --format hex
  pnpm generate-token --length 48 --format hex
`);
      process.exit(0);
    }
  }
  
  // Generate token
  const token = format === 'hex' 
    ? generateHexToken(length)
    : generateAlphanumericToken(length);
  
  console.log(token);
}

main();

