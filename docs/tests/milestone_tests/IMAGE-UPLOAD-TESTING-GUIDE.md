# Image Upload Testing Guide

This guide explains how to test the Cloudinary image upload functionality for Equipment and Room endpoints.

## Prerequisites

1. **Server Running**: Start the server with `cd server && npm run dev`
2. **Cloudinary Account**: Set up at https://cloudinary.com (free tier)
3. **Environment Variables**: Configure Cloudinary credentials in `../../../server/.env`

## Cloudinary Setup (If Not Done)

### Step 1: Create Cloudinary Account
1. Go to https://cloudinary.com
2. Sign up for a free account
3. Verify your email

### Step 2: Get Your Credentials
1. Log in to Cloudinary Dashboard
2. You'll see your credentials on the main dashboard:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

### Step 3: Add to Environment Variables
Add these lines to `../../../server/.env`:

```env
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
```

### Step 4: Restart Server
After adding credentials, restart your server:
```bash
cd server
npm run dev
```

## Testing Methods

### Method 1: Automated Test Script (Recommended)

**Step 1: Add a Test Image**
- Place any image file in `` folder
- Rename it to `../test-image.jpg` (or update the script)
- Supported formats: JPG, PNG, GIF, WebP

**Step 2: Run the Test Script**
```bash
node milestone_tests/test-image-upload.js
```

**What It Tests:**
- ✅ Create equipment with image upload
- ✅ Update equipment with new image
- ✅ Create room with image upload
- ✅ Verify Cloudinary URLs are returned
- ✅ Cleanup test data

### Method 2: Manual Testing with Postman

#### Test Equipment Image Upload

**POST** `http://localhost:4000/api/equipment`

**Headers:**
```
Authorization: Bearer <your-staff-or-admin-token>
```

**Body (form-data):**
- `name`: "Test Equipment"
- `category`: "Laboratory Equipment"
- `description`: "Equipment with image"
- `status`: "available"
- `image`: [Select File]

**Expected Response:**
```json
{
  "id": 4,
  "name": "Test Equipment",
  "category": "Laboratory Equipment",
  "description": "Equipment with image",
  "imageUrl": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/ptcf/equipment/abc123.jpg",
  "status": "available",
  "createdAt": "2026-04-01T...",
  "updatedAt": "2026-04-01T..."
}
```

#### Test Room Image Upload

**POST** `http://localhost:4000/api/rooms`

**Headers:**
```
Authorization: Bearer <your-staff-or-admin-token>
```

**Body (form-data):**
- `name`: "Test Room"
- `description`: "Room with image"
- `location`: "ICropS 3rd Floor"
- `capacity`: "10"
- `status`: "available"
- `image`: [Select File]

**Expected Response:**
```json
{
  "id": 3,
  "name": "Test Room",
  "description": "Room with image",
  "location": "ICropS 3rd Floor",
  "capacity": 10,
  "imageUrl": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/ptcf/rooms/xyz789.jpg",
  "status": "available",
  "createdAt": "2026-04-01T...",
  "updatedAt": "2026-04-01T..."
}
```

### Method 3: Using cURL

#### Equipment with Image
```bash
curl -X POST http://localhost:4000/api/equipment \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "name=Test Equipment" \
  -F "category=Laboratory Equipment" \
  -F "description=Equipment with image" \
  -F "status=available" \
  -F "image=@path/to/your/image.jpg"
```

#### Room with Image
```bash
curl -X POST http://localhost:4000/api/rooms \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "name=Test Room" \
  -F "description=Room with image" \
  -F "location=ICropS 3rd Floor" \
  -F "capacity=10" \
  -F "status=available" \
  -F "image=@path/to/your/image.jpg"
```

## Getting an Auth Token

Run this to get a staff token:
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"staff@uplb.edu.ph","password":"staff123"}'
```

Copy the `token` value from the response.

## Troubleshooting

### Error: "Failed to upload image"
**Cause:** Cloudinary credentials not configured or invalid

**Solution:**
1. Check `../../../server/.env` has all three Cloudinary variables
2. Verify credentials are correct (no extra spaces)
3. Restart the server after adding credentials

### Error: "Invalid file type"
**Cause:** File type not allowed

**Solution:** Only use JPEG, PNG, GIF, or WebP images

### Error: "File too large"
**Cause:** Image exceeds 5MB limit

**Solution:** Use a smaller image file (under 5MB)

### Error: 401 Unauthorized
**Cause:** Missing or invalid JWT token

**Solution:** 
1. Login to get a fresh token
2. Ensure token is in Authorization header as `Bearer <token>`

### Error: 403 Forbidden
**Cause:** User doesn't have staff/admin role

**Solution:** Use staff or admin credentials:
- Staff: `staff@uplb.edu.ph` / `staff123`
- Admin: `admin@uplb.edu.ph` / `admin123`

## Verifying Upload Success

After successful upload, check:
1. ✅ Response includes `imageUrl` field
2. ✅ `imageUrl` starts with `https://res.cloudinary.com/`
3. ✅ Opening the URL in browser shows the uploaded image
4. ✅ Image is stored in correct Cloudinary folder:
   - Equipment: `ptcf/equipment/`
   - Rooms: `ptcf/rooms/`

## Cloudinary Dashboard

View uploaded images:
1. Log in to Cloudinary Dashboard
2. Go to Media Library
3. Navigate to `ptcf` folder
4. See `equipment/` and `rooms/` subfolders

## Optional: Testing Without Images

All endpoints work without images (images are optional):

```bash
# Create equipment without image
curl -X POST http://localhost:4000/api/equipment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Equipment No Image",
    "category": "Test",
    "description": "No image uploaded"
  }'
```

The `imageUrl` field will be `null` in the response.

## Next Steps

After verifying image uploads work:
1. Test updating existing items with new images
2. Verify old images are replaced (not deleted from Cloudinary)
3. Consider implementing image deletion from Cloudinary when items are deleted
4. Add image optimization (resize, compression) if needed

## Notes

- Free Cloudinary tier: 25GB storage, 25GB bandwidth/month
- Images are stored permanently until manually deleted
- Consider cleanup strategy for deleted equipment/rooms
- Image URLs are HTTPS and CDN-optimized
