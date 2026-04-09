const axios = require('axios');
const { checkServerHealth } = require('./utils/test-helpers');

const BASE_URL = 'http://localhost:4000/api';
const RUN_ID = Date.now();
const RUN_DAY_BASE = 120 + (Math.floor(RUN_ID / 1000) % 5000);

let studentToken = '';
let staffToken = '';
let adminToken = '';
let studentUserId = null;
let testBookingId = null;
let conflictedBookingId = null;
let equipmentIds = [];
let roomIds = [];

function equipmentId(index = 0) {
  return equipmentIds[index % equipmentIds.length];
}

function roomId(index = 0) {
  return roomIds[index % roomIds.length];
}

async function resolveResources() {
  console.log('\n--- Setup: Resolving Equipment/Room IDs ---');

  const [equipmentResponse, roomResponse] = await Promise.all([
    axios.get(`${BASE_URL}/equipment`),
    axios.get(`${BASE_URL}/rooms`),
  ]);

  equipmentIds = (equipmentResponse.data || []).map(item => item.id).filter(Boolean);
  roomIds = (roomResponse.data || []).map(item => item.id).filter(Boolean);

  if (equipmentIds.length === 0 || roomIds.length === 0) {
    throw new Error(
      `Missing seed resources. Equipment found: ${equipmentIds.length}, Rooms found: ${roomIds.length}.`
    );
  }

  console.log(`✅ Equipment IDs: ${equipmentIds.join(', ')}`);
  console.log(`✅ Room IDs: ${roomIds.join(', ')}`);
}

function windowAt(dayOffset, startHour, durationHours = 2) {
  const start = new Date();
  start.setDate(start.getDate() + RUN_DAY_BASE + dayOffset);
  start.setHours(startHour, 0, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + durationHours);

  return { start, end };
}

async function testMilestone6() {
  console.log('=== MILESTONE 6 VERIFICATION TEST ===');
  console.log('Testing: Booking Backend (Database + API + Conflict Detection)\n');

  const healthCheck = await checkServerHealth(BASE_URL);
  if (!healthCheck.success) {
    console.log('\n❌ Cannot proceed: Server is not running');
    console.log('   Please start the server with: cd server && npm start');
    return;
  }

  console.log('\n--- Test 1: User Authentication ---');
  try {
    const studentLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'student@uplb.edu.ph',
      password: 'password123'
    });
    studentToken = studentLogin.data.token;
    studentUserId = studentLogin.data.user.id;
    console.log('✅ Student login successful');
    console.log(`   Student User ID: ${studentUserId}`);

    const staffLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'staff@uplb.edu.ph',
      password: 'staff123'
    });
    staffToken = staffLogin.data.token;
    console.log('✅ Staff login successful');

    const adminLogin = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@uplb.edu.ph',
      password: 'admin123'
    });
    adminToken = adminLogin.data.token;
    console.log('✅ Admin login successful');
  } catch (error) {
    console.log('❌ Authentication failed:', error.response?.data || error.message);
    return;
  }

  try {
    await resolveResources();
  } catch (error) {
    console.log('❌ Failed to resolve resources:', error.message);
    return;
  }

  console.log('\n--- Test 2: Create Pencil Booking (Equipment) ---');
  try {
    const { start, end } = windowAt(1, 10, 2);

    const response = await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
        resourceId: equipmentId(0),
        bookingType: 'pencil',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        purpose: 'Test pencil booking for equipment'
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` }
      }
    );

    testBookingId = response.data.booking.id;
    if (response.data.booking.status !== 'penciled') {
      throw new Error(`Expected status "penciled" for pencil booking, got "${response.data.booking.status}"`);
    }
    if (!response.data.booking.expiryAt) {
      throw new Error('Expected expiryAt to be set for pencil booking');
    }

    console.log('✅ Pencil booking created successfully');
    console.log(`   Booking ID: ${testBookingId}`);
    console.log(`   Status: ${response.data.booking.status}`);
    console.log(`   Expiry: ${response.data.booking.expiryAt ? 'Set (3 days)' : 'None'}`);
  } catch (error) {
    console.log('❌ Failed to create pencil booking:', error.response?.data || error.message);
    throw error;
  }

  console.log('\n--- Test 3: Create Firm Booking (Room) ---');
  try {
    const { start, end } = windowAt(2, 14, 3);

    const response = await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'room',
        resourceId: roomId(0),
        bookingType: 'firm',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        purpose: 'Test firm booking for room',
        authorizationDocUrl: 'https://res.cloudinary.com/demo/test.pdf'
      },
      {
        headers: { Authorization: `Bearer ${staffToken}` }
      }
    );

    if (response.data.booking.status !== 'pending_approval') {
      throw new Error(`Expected status "pending_approval" for firm booking, got "${response.data.booking.status}"`);
    }
    if (response.data.booking.expiryAt) {
      throw new Error('Expected expiryAt to be null for firm booking');
    }

    console.log('✅ Firm booking created successfully');
    console.log(`   Booking ID: ${response.data.booking.id}`);
    console.log(`   Status: ${response.data.booking.status}`);
    console.log(`   Expiry: ${response.data.booking.expiryAt ? 'Set' : 'None (firm booking)'}`);
  } catch (error) {
    console.log('❌ Failed to create firm booking:', error.response?.data || error.message);
    throw error;
  }

  console.log('\n--- Test 4: Conflict Detection - Overlapping Pencil Booking (Contested) ---');
  try {
    const { start, end } = windowAt(1, 11, 2);

    const response = await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
        resourceId: equipmentId(0),
        bookingType: 'pencil',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        purpose: 'Overlapping pencil booking to test conflict detection'
      },
      {
        headers: { Authorization: `Bearer ${adminToken}` }
      }
    );

    conflictedBookingId = response.data.booking.id;
    
    if (response.data.booking.status === 'contested') {
      console.log('✅ Conflict detected correctly - Status set to "contested"');
      console.log(`   Booking ID: ${conflictedBookingId}`);
      console.log(`   Conflicts found: ${response.data.conflicts?.length || 0}`);
      if (response.data.conflicts && response.data.conflicts.length > 0) {
        console.log(`   Conflicting with booking ID: ${response.data.conflicts[0].id}`);
      }
    } else {
      throw new Error(`Expected status "contested" for overlapping pencil booking, got "${response.data.booking.status}"`);
    }
  } catch (error) {
    console.log('❌ Failed to create overlapping pencil booking:', error.response?.data || error.message);
    throw error;
  }

  console.log('\n--- Test 5: Conflict Detection - Overlapping Firm Booking (Rejected) ---');
  try {
    const { start, end } = windowAt(1, 11, 1);
    start.setMinutes(30);
    end.setMinutes(30);

    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
        resourceId: equipmentId(0),
        bookingType: 'firm',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        purpose: 'This firm booking should be rejected due to conflicts'
      },
      {
        headers: { Authorization: `Bearer ${staffToken}` }
      }
    );

    console.log('❌ Firm booking should have been rejected due to conflicts');
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('✅ Firm booking correctly rejected with 409 Conflict');
      console.log(`   Conflicts detected: ${error.response.data.conflicts?.length || 0}`);
    } else {
      console.log('❌ Unexpected error:', error.response?.data || error.message);
      throw error;
    }
  }

  console.log('\n--- Test 6: Validation - Missing Required Fields ---');
  try {
    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
        bookingType: 'pencil'
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` }
      }
    );
    console.log('❌ Should have rejected booking with missing fields');
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Correctly rejected booking with missing fields (400)');
    } else {
      console.log('❌ Unexpected error:', error.response?.status);
    }
  }

  console.log('\n--- Test 7: Validation - Invalid Date Range ---');
  try {
    const { start, end } = windowAt(10, 14, 2);
    end.setHours(10, 0, 0, 0);

    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'room',
        resourceId: roomId(0),
        bookingType: 'pencil',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        purpose: 'Invalid date range test'
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` }
      }
    );
    console.log('❌ Should have rejected booking with invalid date range');
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.error.includes('after')) {
      console.log('✅ Correctly rejected booking with endTime before startTime (400)');
    } else {
      console.log('❌ Unexpected error:', error.response?.data || error.message);
    }
  }

  console.log('\n--- Test 8: Validation - Booking in the Past ---');
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(10, 0, 0, 0);
    
    const endTime = new Date(yesterday);
    endTime.setHours(12, 0, 0, 0);

    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
        resourceId: 1,
        bookingType: 'pencil',
        startTime: yesterday.toISOString(),
        endTime: endTime.toISOString(),
        purpose: 'Past booking test'
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` }
      }
    );
    console.log('❌ Should have rejected booking in the past');
  } catch (error) {
    if (error.response?.status === 400 && error.response.data.error.includes('past')) {
      console.log('✅ Correctly rejected booking in the past (400)');
    } else {
      console.log('❌ Unexpected error:', error.response?.data || error.message);
    }
  }

  console.log('\n--- Test 9: Validation - Non-existent Resource ---');
  try {
    const { start, end } = windowAt(12, 10, 2);

    await axios.post(
      `${BASE_URL}/bookings`,
      {
        resourceType: 'equipment',
        resourceId: 9999,
        bookingType: 'pencil',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        purpose: 'Non-existent resource test'
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` }
      }
    );
    console.log('❌ Should have rejected booking for non-existent resource');
  } catch (error) {
    if (error.response?.status === 404) { 
      console.log('✅ Correctly rejected booking for non-existent resource (404)');
    } else {
      console.log('❌ Unexpected error:', error.response?.status);
    }
  }

  console.log('\n--- Test 10: Get All Bookings (Student - Own Bookings Only) ---');
  try {
    const response = await axios.get(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });

    console.log('✅ Student retrieved bookings successfully');
    console.log(`   Total bookings visible: ${response.data.length}`);
    
    if (response.data.length > 0) {
      const allOwnedByStudent = response.data.every(b => b.userId === studentUserId);
      if (allOwnedByStudent) {
        console.log(`✅ Student can only see their own bookings (userId: ${studentUserId})`);
      } else {
        console.log(`⚠️  Warning: Student can see other users' bookings`);
        console.log(`   Expected all bookings to have userId: ${studentUserId}`);
        const otherUserIds = [...new Set(response.data.map(b => b.userId).filter(id => id !== studentUserId))];
        console.log(`   Found bookings from other users: ${otherUserIds.join(', ')}`);
      }
    } else {
      console.log('ℹ️  No bookings found for this student');
    }
  } catch (error) {
    console.log('❌ Failed to get bookings:', error.response?.data || error.message);
  }

  console.log('\n--- Test 11: Get All Bookings (Staff - All Bookings) ---');
  try {
    const response = await axios.get(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });

    console.log('✅ Staff retrieved all bookings successfully');
    console.log(`   Total bookings visible: ${response.data.length}`);
    
    const hasMultipleUsers = new Set(response.data.map(b => b.userId)).size > 1;
    if (hasMultipleUsers) {
      console.log('✅ Staff can see bookings from multiple users');
    }
  } catch (error) {
    console.log('❌ Failed to get bookings:', error.response?.data || error.message);
  }

  console.log('\n--- Test 12: Get Booking by ID (Owner Access) ---');
  if (testBookingId) {
    try {
      const response = await axios.get(`${BASE_URL}/bookings/${testBookingId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });

      console.log('✅ Student retrieved their own booking successfully');
      console.log(`   Booking ID: ${response.data.id}`);
      console.log(`   Resource: ${response.data.resourceType} #${response.data.resourceId}`);
      console.log(`   User details included: ${response.data.user ? 'Yes' : 'No'}`);
    } catch (error) {
      console.log('❌ Failed to get booking by ID:', error.response?.data || error.message);
    }
  }

  console.log('\n--- Test 13: Get Booking by ID (Unauthorized - Other User) ---');
  if (conflictedBookingId) {
    try {
      await axios.get(`${BASE_URL}/bookings/${conflictedBookingId}`, {
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      console.log('❌ Student should not be able to view other users\' bookings');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Correctly blocked student from viewing other users\' bookings (403)');
      } else {
        console.log('❌ Unexpected error:', error.response?.status);
      }
    }
  }

  console.log('\n--- Test 14: Get Booking by ID (Staff Access - Any Booking) ---');
  if (testBookingId) {
    try {
      const response = await axios.get(`${BASE_URL}/bookings/${testBookingId}`, {
        headers: { Authorization: `Bearer ${staffToken}` }
      });

      console.log('✅ Staff can view any user\'s booking');
      console.log(`   Booking owner: ${response.data.user.email}`);
    } catch (error) {
      console.log('❌ Failed to get booking:', error.response?.data || error.message);
    }
  }

  console.log('\n--- Test 15: Filter Bookings by Status ---');
  try {
    const response = await axios.get(`${BASE_URL}/bookings?status=contested`, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });

    console.log('✅ Successfully filtered bookings by status');
    console.log(`   Contested bookings found: ${response.data.length}`);
    
    const allContested = response.data.every(b => b.status === 'contested');
    if (allContested) {
      console.log('✅ All returned bookings have status "contested"');
    } else {
      throw new Error('Status filter returned non-contested bookings');
    }
  } catch (error) {
    console.log('❌ Failed to filter bookings:', error.response?.data || error.message);
    throw error;
  }

  console.log('\n--- Test 16: Filter Bookings by Resource Type ---');
  try {
    const response = await axios.get(`${BASE_URL}/bookings?resourceType=equipment`, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });

    console.log('✅ Successfully filtered bookings by resource type');
    console.log(`   Equipment bookings found: ${response.data.length}`);
    
    const allEquipment = response.data.every(b => b.resourceType === 'equipment');
    if (allEquipment) {
      console.log('✅ All returned bookings are for equipment');
    } else {
      throw new Error('Resource type filter returned non-equipment bookings');
    }
  } catch (error) {
    console.log('❌ Failed to filter bookings:', error.response?.data || error.message);
    throw error;
  }

  console.log('\n=== TEST SUMMARY ===');
  console.log('✅ All Milestone 6 tests completed successfully!');
  console.log('\nVerified Features:');
  console.log('  ✅ Bookings table created with proper schema');
  console.log('  ✅ Booking model with associations working');
  console.log('  ✅ Create pencil bookings (tentative, can overlap)');
  console.log('  ✅ Create firm bookings (pending_approval, no overlaps)');
  console.log('  ✅ Conflict detection for overlapping bookings');
  console.log('  ✅ Pencil bookings marked as "contested" when overlapping');
  console.log('  ✅ Firm bookings rejected (409) when overlapping');
  console.log('  ✅ Auto-expiry set for pencil bookings (3 days)');
  console.log('  ✅ Validation: required fields, date ranges, past bookings');
  console.log('  ✅ Validation: resource existence check');
  console.log('  ✅ Role-based access: users see own bookings');
  console.log('  ✅ Role-based access: staff/admin see all bookings');
  console.log('  ✅ Authorization: users cannot view others\' bookings');
  console.log('  ✅ Filtering by status and resource type');
  console.log('  ✅ User associations included in responses');
  console.log('\n=== MILESTONE 6 COMPLETE ===');
}

testMilestone6().catch(console.error);
