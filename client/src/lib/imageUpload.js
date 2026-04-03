import axios from 'axios';

export async function uploadWithImage(url, data, imageFile, method = 'POST') {
  const formData = new FormData();
  
  Object.keys(data).forEach((key) => {
    if (data[key] !== null && data[key] !== undefined) {
      formData.append(key, data[key]);
    }
  });
  
  if (imageFile) {
    formData.append('image', imageFile);
  }
  
  const token = localStorage.getItem('token');
  
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
  
  const response = await axios({
    method,
    url: `${apiBaseUrl}${url}`,
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  
  return response.data;
}
