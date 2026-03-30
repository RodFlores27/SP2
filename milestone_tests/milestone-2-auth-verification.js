const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api';

const testUsers = [
  { email: 'student@uplb.edu.ph', password: 'password123', role: 'regular_user' },
  { email: 'staff@uplb.edu.ph', password: 'staff123', role: 'ptcf_staff' },
  { email: 'admin@uplb.edu.ph', password: 'admin123', role: 'system_admin' },
];

async function testDay2() {
  console.log('=== DAY 2 VERIFICATION TEST ===\n');

  for (const user of testUsers) {
    console.log(`\n--- Testing ${user.role} (${user.email}) ---`);

    try {
      // Test login
      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
        email: user.email,
        password: user.password,
      });

      console.log('✅ Login successful');
      console.log(`   Token: ${loginRes.data.token.substring(0, 20)}...`);
      console.log(`   User ID: ${loginRes.data.user.id}`);
      console.log(`   Account Type: ${loginRes.data.user.accountType}`);

      const token = loginRes.data.token;

      // Test /me endpoint
      const meRes = await axios.get(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('✅ /me endpoint working');

      // Test staff-only endpoint
      try {
        const staffRes = await axios.get(`${BASE_URL}/auth/staff-only`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('✅ Staff-only access granted');
      } catch (err) {
        if (err.response?.status === 403) {
          console.log('✅ Staff-only access denied (expected for regular_user)');
        } else {
          throw err;
        }
      }

      // Test admin-only endpoint
      try {
        const adminRes = await axios.get(`${BASE_URL}/auth/admin-only`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('✅ Admin-only access granted');
      } catch (err) {
        if (err.response?.status === 403) {
          console.log('✅ Admin-only access denied (expected for non-admin)');
        } else {
          throw err;
        }
      }

    } catch (error) {
      console.error('❌ Error:', error.response?.data || error.message);
    }
  }

  console.log('\n=== TEST COMPLETE ===');
}

testDay2().catch(console.error);
