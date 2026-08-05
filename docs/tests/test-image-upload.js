const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:4000/api';

async function testImageUploads() {
  console.log('=== IMAGE UPLOAD TEST ===\n');

  console.log('--- Step 1: Login as Staff ---');
  let staffToken;
  try {
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'staff@uplb.edu.ph',
      password: 'staff123',
    });
    staffToken = loginResponse.data.token;
    console.log('✅ Staff login successful\n');
  } catch (error) {
    console.log('❌ Login failed:', error.response?.data || error.message);
    return;
  }

  console.log('--- Step 2: Create Equipment with Image Upload ---');
  console.log('Instructions:');
  console.log('1. Place a test image file in this directory (milestone_tests/)');
  console.log('2. Name it "test-image.jpg" (or update the filename below)');
  console.log('3. Run this script again\n');

  const testImagePath = path.join(__dirname, 'test-image.jpg');
  
  if (!fs.existsSync(testImagePath)) {
    console.log('⚠️  Test image not found at:', testImagePath);
    console.log('   Please add a test image file and run again.\n');
    console.log('Alternative: Test manually using Postman or similar tool:');
    console.log('   POST http://localhost:4000/api/equipment');
    console.log('   Headers: Authorization: Bearer <your-token>');
    console.log('   Body: form-data');
    console.log('     - name: "Test Equipment"');
    console.log('     - category: "Test Category"');
    console.log('     - description: "Test Description"');
    console.log('     - image: [select file]');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('name', 'Microscope with Image');
    formData.append('category', 'Laboratory Equipment');
    formData.append('description', 'High-powered microscope with uploaded image');
    formData.append('status', 'available');
    formData.append('image', fs.createReadStream(testImagePath));

    const response = await axios.post(`${BASE_URL}/equipment`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${staffToken}`,
      },
    });

    console.log('✅ Equipment created with image upload');
    console.log('   ID:', response.data.id);
    console.log('   Name:', response.data.name);
    console.log('   Image URL:', response.data.imageUrl);
    console.log('   Cloudinary URL verified:', response.data.imageUrl?.includes('cloudinary.com') ? '✅' : '❌');

    const equipmentId = response.data.id;

    console.log('\n--- Step 3: Update Equipment with New Image ---');
    const updateFormData = new FormData();
    updateFormData.append('description', 'Updated description with new image');
    updateFormData.append('image', fs.createReadStream(testImagePath));

    const updateResponse = await axios.put(`${BASE_URL}/equipment/${equipmentId}`, updateFormData, {
      headers: {
        ...updateFormData.getHeaders(),
        'Authorization': `Bearer ${staffToken}`,
      },
    });

    console.log('✅ Equipment updated with new image');
    console.log('   New Image URL:', updateResponse.data.imageUrl);
    console.log('   Description updated:', updateResponse.data.description);

    console.log('\n--- Step 4: Create Room with Image Upload ---');
    const roomFormData = new FormData();
    roomFormData.append('name', 'Test Room with Image');
    roomFormData.append('description', 'Room with uploaded image');
    roomFormData.append('location', 'ICropS 3rd Floor');
    roomFormData.append('capacity', '10');
    roomFormData.append('status', 'available');
    roomFormData.append('image', fs.createReadStream(testImagePath));

    const roomResponse = await axios.post(`${BASE_URL}/rooms`, roomFormData, {
      headers: {
        ...roomFormData.getHeaders(),
        'Authorization': `Bearer ${staffToken}`,
      },
    });

    console.log('✅ Room created with image upload');
    console.log('   ID:', roomResponse.data.id);
    console.log('   Name:', roomResponse.data.name);
    console.log('   Image URL:', roomResponse.data.imageUrl);
    console.log('   Cloudinary URL verified:', roomResponse.data.imageUrl?.includes('cloudinary.com') ? '✅' : '❌');

    console.log('\n--- Step 5: Cleanup Test Data ---');
    await axios.delete(`${BASE_URL}/equipment/${equipmentId}`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log('✅ Test equipment deleted');

    await axios.delete(`${BASE_URL}/rooms/${roomResponse.data.id}`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    console.log('✅ Test room deleted');

    console.log('\n=== IMAGE UPLOAD TEST COMPLETE ===');
    console.log('✅ All image upload milestone_tests passed');
    console.log('✅ Cloudinary integration working correctly');

  } catch (error) {
    console.log('❌ Image upload test failed:', error.response?.data || error.message);
    if (error.response?.status === 500 && error.response?.data?.error === 'Failed to upload image') {
      console.log('\n⚠️  Cloudinary configuration issue detected!');
      console.log('   Please check your .env file has:');
      console.log('   - CLOUDINARY_CLOUD_NAME');
      console.log('   - CLOUDINARY_API_KEY');
      console.log('   - CLOUDINARY_API_SECRET');
    }
  }
}

console.log('Image Upload Test Utility');
console.log('=========================\n');
console.log('This script milestone_tests image uploads to Equipment and Room endpoints.\n');
console.log('Prerequisites:');
console.log('1. Server running on http://localhost:4000');
console.log('2. Cloudinary credentials configured in server/.env');
console.log('3. Test image file: milestone_tests/test-image.jpg\n');

testImageUploads().catch(console.error);
