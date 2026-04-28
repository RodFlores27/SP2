const fs = require('fs');
const path = require('path');
const axios = require('axios');

function loadMilestoneTestEnv() {
  const envPath = path.join(__dirname, '..', '..', 'server', '.env');
  if (!fs.existsSync(envPath)) return;

  try {
    const dotenv = require(path.join(
      __dirname,
      '..',
      '..',
      'server',
      'node_modules',
      'dotenv'
    ));
    dotenv.config({ path: envPath });
  } catch (error) {
    console.warn('[tests] Could not load server/.env:', error.message);
  }
}

loadMilestoneTestEnv();

/**
 * Check if the server is running and healthy
 * @param {string} baseUrl - Base URL of the API (e.g., 'http://localhost:4000/api')
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function checkServerHealth(baseUrl) {
  console.log('--- Server Health Check ---');
  
  try {
    const healthRes = await axios.get(`${baseUrl}/health`);
    
    if (healthRes.data.status === 'ok') {
      console.log('✅ Server is running and responding');
      console.log(`   Message: ${healthRes.data.message}`);
      return {
        success: true,
        message: healthRes.data.message
      };
    } else {
      console.log('❌ Server health check failed');
      console.log(`   Status: ${healthRes.data.status}`);
      return {
        success: false,
        error: 'Server health check returned non-ok status'
      };
    }
  } catch (error) {
    console.log('❌ Server is not accessible');
    console.log(`   Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  checkServerHealth
};
