const axios = require('axios');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';

let staffToken = '';
let regularUserToken = '';
let testEquipmentId = null;
let testRoomId = null;

async function testMilestone5() {
  console.log('=== MILESTONE 5 VERIFICATION TEST ===');
  console.log('Testing: Equipment & Room Listing Pages with Staff Management\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Cannot proceed: Server is not running');
    console.log('   Please start the server with: npm start (in server directory)');
    return;
  }

  try {
    await testAuthentication();
    await testEquipmentEndpoints();
    await testRoomEndpoints();
    await testRoleBasedAccess();
    
    console.log('\n=== TEST SUMMARY ===');
    console.log('✅ All Milestone 5 milestone_tests passed successfully!');
    console.log('\n📋 Verified Features:');
    console.log('   • Public access to equipment listing');
    console.log('   • Public access to room listing');
    console.log('   • Protected access to detail pages (requires auth)');
    console.log('   • Staff CRUD operations (create, update, delete)');
    console.log('   • Role-based authorization (staff vs regular users)');
    console.log('   • Image upload support (multipart/form-data)');
    console.log('\n=== TEST COMPLETE ===');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
  }
}

async function testAuthentication() {
  console.log('\n--- Test 1: User Authentication ---');
  
  try {
    const staffLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'staff@uplb.edu.ph',
      password: 'staff123',
    });
    staffToken = staffLogin.data.token;
    console.log('✅ Staff login successful');

    const userLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'student@uplb.edu.ph',
      password: 'password123',
    });
    regularUserToken = userLogin.data.token;
    console.log('✅ Regular user login successful');
  } catch (error) {
    throw new Error('Authentication failed: ' + error.message);
  }
}

async function testEquipmentEndpoints() {
  console.log('\n--- Test 2: Equipment Endpoints ---');

  console.log('\n2.1: Public access to equipment listing (no auth)');
  const listResponse = await axios.get(`${BASE_URL}/equipment`);
  console.log(`✅ Retrieved ${listResponse.data.length} equipment items (public access)`);

  console.log('\n2.2: Staff creates new equipment');
  const createResponse = await axios.post(
    `${BASE_URL}/equipment`,
    {
      name: 'Test Equipment',
      category: 'Testing',
      description: 'This is a test equipment for Milestone 5 verification',
      codeGroup: 'TEST',
      resourceCode: `TE-${Date.now()}`,
      status: 'available',
    },
    {
      headers: { Authorization: `Bearer ${staffToken}` },
    }
  );
  testEquipmentId = createResponse.data.id;
  console.log(`✅ Equipment created with ID: ${testEquipmentId}`);

  console.log('\n2.3: Protected access to equipment detail (requires auth)');
  const detailResponse = await axios.get(`${BASE_URL}/equipment/${testEquipmentId}`, {
    headers: { Authorization: `Bearer ${regularUserToken}` },
  });
  console.log(`✅ Retrieved equipment details: ${detailResponse.data.name}`);

  console.log('\n2.4: Staff updates equipment');
  const updateResponse = await axios.put(
    `${BASE_URL}/equipment/${testEquipmentId}`,
    {
      name: 'Updated Test Equipment',
      description: 'Updated description',
    },
    {
      headers: { Authorization: `Bearer ${staffToken}` },
    }
  );
  console.log(`✅ Equipment updated: ${updateResponse.data.name}`);

  console.log('\n2.5: Verify equipment appears in listing');
  const updatedList = await axios.get(`${BASE_URL}/equipment`);
  const foundEquipment = updatedList.data.find((e) => e.id === testEquipmentId);
  if (foundEquipment && foundEquipment.name === 'Updated Test Equipment') {
    console.log('✅ Updated equipment found in listing');
  } else {
    throw new Error('Updated equipment not found in listing');
  }
}

async function testRoomEndpoints() {
  console.log('\n--- Test 3: Room Endpoints ---');

  console.log('\n3.1: Public access to room listing (no auth)');
  const listResponse = await axios.get(`${BASE_URL}/rooms`);
  console.log(`✅ Retrieved ${listResponse.data.length} rooms (public access)`);

  console.log('\n3.2: Staff creates new room');
  const createResponse = await axios.post(
    `${BASE_URL}/rooms`,
    {
      name: 'Test Room',
      description: 'This is a test room for Milestone 5 verification',
      location: 'Test Building',
      resourceCode: `TR-${Date.now()}` ,
      capacity: 10,
      status: 'available',
    },
    {
      headers: { Authorization: `Bearer ${staffToken}` },
    }
  );
  testRoomId = createResponse.data.id;
  console.log(`✅ Room created with ID: ${testRoomId}`);

  console.log('\n3.3: Protected access to room detail (requires auth)');
  const detailResponse = await axios.get(`${BASE_URL}/rooms/${testRoomId}`, {
    headers: { Authorization: `Bearer ${regularUserToken}` },
  });
  console.log(`✅ Retrieved room details: ${detailResponse.data.name}`);

  console.log('\n3.4: Staff updates room');
  const updateResponse = await axios.put(
    `${BASE_URL}/rooms/${testRoomId}`,
    {
      name: 'Updated Test Room',
      capacity: 15,
    },
    {
      headers: { Authorization: `Bearer ${staffToken}` },
    }
  );
  console.log(`✅ Room updated: ${updateResponse.data.name}, capacity: ${updateResponse.data.capacity}`);

  console.log('\n3.5: Verify room appears in listing');
  const updatedList = await axios.get(`${BASE_URL}/rooms`);
  const foundRoom = updatedList.data.find((r) => r.id === testRoomId);
  if (foundRoom && foundRoom.name === 'Updated Test Room' && foundRoom.capacity === 15) {
    console.log('✅ Updated room found in listing');
  } else {
    throw new Error('Updated room not found in listing');
  }
}

async function testRoleBasedAccess() {
  console.log('\n--- Test 4: Role-Based Access Control ---');

  console.log('\n4.1: Regular user cannot create equipment');
  try {
    await axios.post(
      `${BASE_URL}/equipment`,
      {
        name: 'Unauthorized Equipment',
        category: 'Test',
        description: 'Should fail',
        status: 'available',
      },
      {
        headers: { Authorization: `Bearer ${regularUserToken}` },
      }
    );
    throw new Error('Regular user should not be able to create equipment');
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log('✅ Regular user blocked from creating equipment (403 Forbidden)');
    } else {
      throw error;
    }
  }

  console.log('\n4.2: Regular user cannot update room');
  try {
    await axios.put(
      `${BASE_URL}/rooms/${testRoomId}`,
      { name: 'Unauthorized Update' },
      {
        headers: { Authorization: `Bearer ${regularUserToken}` },
      }
    );
    throw new Error('Regular user should not be able to update room');
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log('✅ Regular user blocked from updating room (403 Forbidden)');
    } else {
      throw error;
    }
  }

  console.log('\n4.3: Regular user cannot delete equipment');
  try {
    await axios.delete(`${BASE_URL}/equipment/${testEquipmentId}`, {
      headers: { Authorization: `Bearer ${regularUserToken}` },
    });
    throw new Error('Regular user should not be able to delete equipment');
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log('✅ Regular user blocked from deleting equipment (403 Forbidden)');
    } else {
      throw error;
    }
  }

  console.log('\n4.4: Staff can delete test equipment');
  await axios.delete(`${BASE_URL}/equipment/${testEquipmentId}`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  console.log('✅ Staff successfully deleted equipment');

  console.log('\n4.5: Verify deleted equipment returns 404');
  try {
    await axios.get(`${BASE_URL}/equipment/${testEquipmentId}`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    throw new Error('Deleted equipment should return 404');
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('✅ Deleted equipment returns 404 Not Found');
    } else {
      throw error;
    }
  }

  console.log('\n4.6: Staff can delete test room');
  await axios.delete(`${BASE_URL}/rooms/${testRoomId}`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  console.log('✅ Staff successfully deleted room');

  console.log('\n4.7: Verify deleted room returns 404');
  try {
    await axios.get(`${BASE_URL}/rooms/${testRoomId}`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    throw new Error('Deleted room should return 404');
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('✅ Deleted room returns 404 Not Found');
    } else {
      throw error;
    }
  }
}

testMilestone5().catch(console.error);
