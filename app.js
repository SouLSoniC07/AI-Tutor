const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const pptxParser = require('pptx-parser');

const app = express();
app.use(express.json());
app.use(cors());

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });
const filesMeta = [];

const mockQA = [
  { question: 'binary search tree', answer: 'A BST is a data structure where left < parent < right.' },
  { question: 'normalization', answer: 'It means organizing DB tables to reduce redundancy.' }
];

// Helper to extract text from file based on extension
async function extractTextFromFile(filePath, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  console.log(`Detected file extension: ${ext}`);

  if (ext === '.pdf') {
    console.log('Parsing PDF file with pdf-parse...');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } else if (ext === '.pptx') {
    console.log('Parsing PPTX file with pptx-parser...');
    try {
      const slides = await pptxParser.parsePresentation(filePath);
      if (Array.isArray(slides)) {
        return slides.join('\n\n');
      } else if (typeof slides === 'string') {
        return slides;
      } else {
        return 'Could not extract text from PPTX file.';
      }
    } catch (err) {
      console.error('pptx-parser error:', err);
      return 'Error parsing PPTX file.';
    }
  } else {
    console.log('Reading file as plain text...');
    return fs.readFileSync(filePath, 'utf8');
  }
}

// Route to handle question answering
app.post('/ask', async (req, res) => {
  try {
    const qText = req.body.question ? req.body.question.toLowerCase() : '';
    console.log(`Received question: ${qText}`);

    // Check in mock Q&A first
    const found = mockQA.find(q => qText.includes(q.question));
    if (found) {
      console.log('Matched mock Q&A.');
      return res.json({ answer: found.answer });
    }

    // Check latest uploaded notes for answer
    if (filesMeta.length > 0) {
      const fileMeta = filesMeta[0];
      const filePath = path.join(__dirname, 'uploads', fileMeta.filename);
      console.log(`Extracting text from uploaded note: ${fileMeta.originalname}`);

      const text = await extractTextFromFile(filePath, fileMeta.originalname);
      const snippet = text.length > 300 ? text.slice(0, 300) + '...' : text;
      return res.json({ answer: `From notes (${fileMeta.originalname}):\n${snippet}` });
    }

    // No answer found
    return res.json({ answer: 'No valid answer found in knowledge base or notes.' });
  } catch (err) {
    console.error('Error in /ask route:', err);
    return res.json({ answer: 'Error processing the question.' });
  }
});

// Route to upload note files with subject and topic
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    const { subject, topic } = req.body;
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded.' });
    }
    filesMeta.unshift({
      filename: req.file.filename,
      originalname: req.file.originalname,
      subject: subject || '',
      topic: topic || ''
    });
    console.log(`File uploaded: ${req.file.originalname}, subject: ${subject}, topic: ${topic}`);
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Error in /upload route:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to upload file.' });
  }
});

// Route to list uploaded files' metadata
app.get('/files', (req, res) => {
  res.json(filesMeta);
});

// Route to serve an uploaded file for download/viewing
app.get('/file/:filename', (req, res) => {
  const file = path.join(__dirname, 'uploads', req.params.filename);
  res.sendFile(file, err => {
    if (err) {
      console.error(`Error sending file ${req.params.filename}:`, err);
      res.status(404).send('File not found.');
    }
  });
});

// Health check
app.get('/', (req, res) => {
  res.send('VTU Tutor API running!');
});

// Start the server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API server started on port ${port}`);
});
