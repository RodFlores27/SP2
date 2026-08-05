const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000/api';
const ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`✅ ${label}`);
  passed += 1;
}

function fail(label, detail) {
  console.log(`❌ ${label}${detail ? `: ${detail}` : ''}`);
  failed += 1;
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function expectIncludes(relPath, needle, label) {
  const text = read(relPath);
  if (text.includes(needle)) {
    pass(label);
  } else {
    fail(label, `Missing "${needle}" in ${relPath}`);
  }
}

function expectNotIncludes(relPath, needle, label) {
  const text = read(relPath);
  if (!text.includes(needle)) {
    pass(label);
  } else {
    fail(label, `Unexpected "${needle}" in ${relPath}`);
  }
}

function walkFiles(dirPath, files = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function expectNoPatternInTree(relDir, pattern, label) {
  const baseDir = path.join(ROOT, relDir);
  const matches = [];

  for (const filePath of walkFiles(baseDir)) {
    const text = fs.readFileSync(filePath, 'utf8');
    if (pattern.test(text)) {
      matches.push(path.relative(ROOT, filePath));
    }
  }

  if (matches.length === 0) {
    pass(label);
  } else {
    fail(label, `Found matches in ${matches.join(', ')}`);
  }
}

function nodeCheck(relPath) {
  const result = spawnSync(process.execPath, ['--check', relPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  if (result.status === 0) {
    pass(`${relPath} parses successfully`);
  } else {
    fail(`${relPath} parses successfully`, result.stderr || result.stdout);
  }
}

async function testMilestone20() {
  console.log('========================================================');
  console.log('Milestone 20 Verification: UP Visual Identity Reskin');
  console.log('========================================================\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    fail('Server health check', healthCheck.error || 'Server unavailable');
    summarize();
    return;
  }
  pass('Server health check passes');

  console.log('\n--- Frontend Brand Tokens ---');
  expectIncludes('client/src/index.css', '--up-maroon: 342.05 73.58% 31.18%;', 'UP maroon token matches official #8A1538 converted to HSL');
  expectIncludes('client/src/index.css', '--up-forest-green: 163.45 100% 17.06%;', 'UP forest green token matches official #00573F converted to HSL');
  expectIncludes('client/src/index.css', '--up-gold: 41.23 100% 55.49%;', 'UP gold token matches official #FFB81C converted to HSL');
  expectIncludes('client/src/index.css', '--up-spot-black: 345 6.06% 12.94%;', 'Spot black approximation token matches #231F20 converted to HSL');
  expectIncludes('client/src/index.css', '--color-up-maroon: hsl(var(--up-maroon));', 'Tailwind v4 @theme exposes maroon utility token');
  expectIncludes('client/src/index.css', '--font-heading:', 'Heading font token is defined');
  if (!exists('client/tailwind.config.js')) {
    pass('Tailwind v4 remains CSS-first with no tailwind.config.js');
  } else {
    fail('Tailwind v4 remains CSS-first with no tailwind.config.js', 'client/tailwind.config.js exists');
  }

  console.log('\n--- Web App Naming Boundary ---');
  expectIncludes('client/index.html', '<title>PTCF Reservation</title>', 'Browser title is PTCF Reservation');
  expectNotIncludes('client/index.html', 'PTCF Reservation System', 'Browser title no longer uses old product name');
  expectIncludes('client/src/components/Navigation.jsx', 'PTCF Reservation', 'Navigation title uses PTCF Reservation');
  expectIncludes('client/src/components/Navigation.jsx', 'Plant Tissue Culture Facility', 'Navigation subtitle uses Plant Tissue Culture Facility');
  expectNotIncludes('client/src/components/Navigation.jsx', 'UPLB ICropS', 'Navigation does not use UPLB ICropS');

  console.log('\n--- Seal and Oblation Boundary ---');
  expectNoPatternInTree('client/src', /\b(Seal|Oblation)\b/i, 'Client source does not reference Seal or Oblation');

  console.log('\n--- App-Owned Email Branding ---');
  expectIncludes('server/utils/booking-notifications.js', 'const EMAIL_THEME = {', 'Booking email theme object exists');
  expectIncludes('server/utils/booking-notifications.js', "maroon: '#8A1538'", 'Booking email maroon uses official hex');
  expectIncludes('server/utils/booking-notifications.js', 'Plant Tissue Culture Facility', 'Booking email eyebrow uses Plant Tissue Culture Facility');
  expectIncludes('server/controllers/auth.controller.js', 'const AUTH_EMAIL_THEME = {', 'Auth email theme object exists');
  expectIncludes('server/controllers/auth.controller.js', 'PTCF Reservation</h2>', 'Auth email title uses PTCF Reservation');
  expectIncludes('server/messages/bookingMessages.js', "appName: 'PTCF Reservation'", 'Booking email appName uses PTCF Reservation');
  expectIncludes('server/utils/email.js', "const FROM_NAME = 'PTCF Reservation';", 'Resend sender name uses PTCF Reservation');

  console.log('\n--- Retired Email Colors and Names ---');
  for (const relPath of [
    'server/utils/booking-notifications.js',
    'server/controllers/auth.controller.js',
    'server/messages/bookingMessages.js',
    'server/utils/email.js',
  ]) {
    expectNotIncludes(relPath, 'PTCF Reservation System', `${relPath} does not use old product name`);
  }
  for (const oldColor of ['#2563eb', '#16a34a', '#dc2626', '#fef2f2', '#eff6ff']) {
    expectNoPatternInTree('server', new RegExp(oldColor, 'i'), `Server app/email files do not use old color ${oldColor}`);
  }

  console.log('\n--- Documentation and Structure ---');
  expectIncludes('docs/visual_design/up-visual-identity-reskin.md', '# UP Visual Identity Reskin Brief', 'Reskin brief exists');
  expectIncludes('docs/visual_design/up-visual-identity-reskin.md', 'The UP Seal and the Oblation must not be used.', 'Reskin brief preserves Seal/Oblation boundary');
  expectNotIncludes('docs/visual_design/up-visual-identity-reskin.md', 'UPLB ICropS', 'Reskin brief avoids UPLB ICropS naming');
  if (exists('client/src/components/ui/button-variants.js')) {
    pass('Shared button variants module exists for Fast Refresh-safe UI exports');
  } else {
    fail('Shared button variants module exists for Fast Refresh-safe UI exports');
  }

  console.log('\n--- Server Syntax Checks ---');
  nodeCheck('server/controllers/auth.controller.js');
  nodeCheck('server/utils/booking-notifications.js');
  nodeCheck('server/messages/bookingMessages.js');
  nodeCheck('server/utils/email.js');

  summarize();
}

function summarize() {
  console.log('\n========================================');
  console.log('Milestone 20 Verification Summary');
  console.log('========================================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log('✅ All Milestone 20 checks passed');
  }
}

testMilestone20().catch((error) => {
  console.error('❌ Milestone 20 verification crashed:', error.message);
  process.exitCode = 1;
});
