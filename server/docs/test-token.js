require('dotenv').config();
const jwt = require('jsonwebtoken');

// Paste your token here (just the token, no "Bearer" prefix)
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsInJvbGUiOiJyZWd1bGFyX3VzZXIiLCJ1c2VyQ2F0ZWdvcnkiOiJzdHVkZW50IiwiaWF0IjoxNzc0OTYyNDA2LCJleHAiOjE3NzUwNDg4MDZ9.zo2Raix9jqw9C4mXw3gKzlzkPZ8wUgppYLJJE3efytM';

const secret = process.env.JWT_SECRET;

console.log('JWT_SECRET exists:', !!secret);
console.log('Token length:', token.length);
console.log('\nVerifying token...\n');

try {
  const decoded = jwt.verify(token, secret);
  console.log('✅ Token is VALID!');
  console.log('Decoded payload:', JSON.stringify(decoded, null, 2));
} catch (err) {
  console.log('❌ Token is INVALID');
  console.log('Error:', err.message);
  console.log('Error name:', err.name);
  
  if (err.name === 'TokenExpiredError') {
    console.log('\nToken expired at:', err.expiredAt);
  } else if (err.name === 'JsonWebTokenError') {
    console.log('\nThis usually means:');
    console.log('- Wrong JWT_SECRET');
    console.log('- Malformed token');
    console.log('- Token has extra spaces/characters');
  }
}
