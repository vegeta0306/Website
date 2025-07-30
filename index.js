require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios'); // For fetching image from URL

const app = express();
const port = 3000;

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static files from 'New folder/dist' with caching
app.use(express.static(path.join(__dirname, 'New folder', 'dist'), {
  maxAge: '1h', // Cache static assets for 1 hour
}));

// Serve uploaded images from 'New folder/public/uploads' with aggressive caching
app.use('/uploads', express.static(path.join(__dirname, 'New folder', 'public', 'uploads'), {
  maxAge: '1y', // Cache images for 1 year (or indefinitely)
  immutable: true, // Mark assets as immutable if their filenames include content hashes (e.g., Date.now())
  setHeaders: (res, path, stat) => {
    res.set('Cache-Control', 'public, max-age=31536000, immutable'); // Explicitly set Cache-Control for images
  },
}));

// Serve news images from 'New folder/public/news'
app.use('/news', express.static(path.join(__dirname, 'New folder', 'public', 'news')));


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'New folder', 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

app.post('/api/upload', upload.array('photos'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }
  const imageUrls = req.files.map(file => `/uploads/${file.filename}`);
  res.json({ imageUrls });
});

app.get('/api/gallery', (req, res) => {
  const uploadDir = path.join(__dirname, 'New folder', 'public', 'uploads');
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to fetch gallery images.' });
    }
    const imageUrls = files.map(file => `/uploads/${file}`);
    res.json(imageUrls);
  });
});

app.delete('/api/gallery/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(__dirname, 'New folder', 'public', 'uploads', filename);

    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(err);
            if (err.code === 'ENOENT') {
                return res.status(404).json({ error: 'Image not found.' });
            }
            return res.status(500).json({ error: 'Failed to delete image.' });
        }
        res.status(200).json({ message: 'Image deleted successfully.' });
    });
});

// Check for API key on startup
if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set.');
}

// Initialize the Google AI client with the API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper function to get image data from a URL
async function getImageData(imageUrl) {
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  return Buffer.from(response.data).toString('base64');
}

// Define a POST route to handle image description
app.post('/api/describe-image', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    // Convert local URL to a full URL
    const fullImageUrl = `http://localhost:${port}${imageUrl}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
    
    // Fetch image data
    const imageBase64 = await getImageData(fullImageUrl);

    const result = await model.generateContent([
      "Describe this image in detail.", 
      {
        inlineData: {
          mimeType: "image/jpeg", // Assuming JPEG for now, ideally, this should be dynamic
          data: imageBase64
        },
      },
    ]);
    const response = await result.response;
    const text = response.text();

    res.json({ description: text });
  } catch (error) {
    console.error('Error describing image:', error);
    res.status(500).json({ error: 'Failed to describe image' });
  }
});


app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'New folder', 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
