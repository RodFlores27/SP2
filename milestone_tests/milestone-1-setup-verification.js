const fs = require('fs');
const path = require('path');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';

async function testMilestone1() {
  console.log('=== MILESTONE 1 VERIFICATION TEST ===\n');
  
  let allPassed = true;

  // Test 1: Server Health Check
  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Cannot proceed: Server is not running');
    console.log('   Please start the server and try again.');
    return;
  }

  // Test 2: Project Structure
  console.log('\n--- Test 2: Project Structure ---');
  const requiredDirs = [
    'client',
    'server',
    'server/config',
    'server/controllers',
    'server/middleware',
    'server/migrations',
    'server/models',
    'server/routes',
    'server/seeders',
  ];

  const projectRoot = path.join(__dirname, '..');
  
  for (const dir of requiredDirs) {
    const dirPath = path.join(projectRoot, dir);
    if (fs.existsSync(dirPath)) {
      console.log(`✅ Directory exists: ${dir}`);
    } else {
      console.log(`❌ Directory missing: ${dir}`);
      allPassed = false;
    }
  }

  // Test 3: Database Migrations
  console.log('\n--- Test 3: Database Migrations ---');
  const migrationsDir = path.join(projectRoot, 'server', 'migrations');
  
  if (fs.existsSync(migrationsDir)) {
    const migrations = fs.readdirSync(migrationsDir);
    const requiredMigrations = [
      'create-user',
      'create-equipment',
      'create-room',
    ];

    for (const required of requiredMigrations) {
      const found = migrations.some(m => m.includes(required));
      if (found) {
        console.log(`✅ Migration exists: ${required}`);
      } else {
        console.log(`❌ Migration missing: ${required}`);
        allPassed = false;
      }
    }
  } else {
    console.log('❌ Migrations directory not found');
    allPassed = false;
  }

  // Test 4: Sequelize Models
  console.log('\n--- Test 4: Sequelize Models ---');
  const modelsDir = path.join(projectRoot, 'server', 'models');
  
  if (fs.existsSync(modelsDir)) {
    const requiredModels = ['user.js', 'equipment.js', 'room.js', 'index.js'];
    
    for (const model of requiredModels) {
      const modelPath = path.join(modelsDir, model);
      if (fs.existsSync(modelPath)) {
        console.log(`✅ Model exists: ${model}`);
      } else {
        console.log(`❌ Model missing: ${model}`);
        allPassed = false;
      }
    }
  } else {
    console.log('❌ Models directory not found');
    allPassed = false;
  }

  // Test 5: Client Setup
  console.log('\n--- Test 5: Client Setup ---');
  const clientFiles = [
    'client/package.json',
    'client/vite.config.js',
    'client/index.html',
    'client/src/main.jsx',
    'client/src/App.jsx',
  ];

  for (const file of clientFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ File exists: ${file}`);
    } else {
      console.log(`❌ File missing: ${file}`);
      allPassed = false;
    }
  }

  // Test 6: Server Configuration
  console.log('\n--- Test 6: Server Configuration ---');
  const serverFiles = [
    'server/package.json',
    'server/index.js',
    'server/.sequelizerc',
    'server/config/config.cjs',
  ];

  for (const file of serverFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ File exists: ${file}`);
    } else {
      console.log(`❌ File missing: ${file}`);
      allPassed = false;
    }
  }

  // Test 7: Git Repository
  console.log('\n--- Test 7: Git Repository ---');
  const gitDir = path.join(projectRoot, '.git');
  if (fs.existsSync(gitDir)) {
    console.log('✅ Git repository initialized');
  } else {
    console.log('❌ Git repository not found');
    allPassed = false;
  }

  const gitignore = path.join(projectRoot, '.gitignore');
  if (fs.existsSync(gitignore)) {
    console.log('✅ .gitignore file exists');
  } else {
    console.log('❌ .gitignore file missing');
    allPassed = false;
  }

  // Final Summary
  console.log('\n=== TEST SUMMARY ===');
  if (allPassed) {
    console.log('✅ All Milestone 1 requirements verified successfully!');
    console.log('   - Monorepo structure set up');
    console.log('   - Database schema created');
    console.log('   - Server running and accessible');
    console.log('   - Ready for Milestone 2');
  } else {
    console.log('❌ Some tests failed. Please review the output above.');
  }
  
  console.log('\n=== TEST COMPLETE ===');
}

testMilestone1().catch(console.error);
