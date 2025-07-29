const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const PPTXParser = require('pptx2json');

const app = express();
app.use(express.json());
app.use(cors());

// Multer config for saving uploaded files
const upload = multer({ dest: 'uploads/' });

// Store uploaded file metadata (in-memory; restart clears this)
const filesMeta = [];

const mockQA = [
  { question: 'binary search tree', answer: 'A BST is a data structure where left < parent < right.' },
  { question: 'normalization', answer: 'It means organizing DB tables to reduce redundancy.' }
];

// Helper to extract text from PDF, PPTX, or plain text files
async function extractTextFromFile(filePath, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  console.log(`Extracting text from file with extension: ${ext}`);

  if (ext === '.pdf') {
    console.log('Parsing PDF file...');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } else if (ext === '.pptx') {
    console.log('Parsing PPTX file...');
    try {
      const parser = new PPTXParser();
      const data = await parser.parse(filePath);

      const allText = data.slides
        .map(slide => slide.texts?.map(t => t.text).join(' '))
        .filter(Boolean)
        .join('\n\n');

      return allText.length > 0 ? allText : 'No text found in PPTX file.';
    } catch (error) {
      console.error('Error parsing PPTX:', error);
      return 'Error extracting text from PPTX file.';
    }
  } else {
    console.log('Reading as plain text...');
    return fs.readFileSync(filePath, 'utf8');
  }
}

// Enhanced /ask route with keyword search in notes for targeted answers
app.post('/ask', async (req, res) => {
  try {
    const qText = req.body.question ? req.body.question.toLowerCase() : '';
    console.log(`Received question: "${qText}"`);

    // 1. Check if question matches mock Q&A
    const found = mockQA.find(q => qText.includes(q.question));
    if (found) {
      console.log('Returning mock Q&A answer');
      return res.json({ answer: found.answer });
    }

    // 2. If no mock match, try to extract relevant text from latest note
    if (filesMeta.length > 0) {
      const fileMeta = filesMeta[0];
      const filePath = path.join(__dirname, 'uploads', fileMeta.filename);
      console.log(`Extracting from uploaded file: ${fileMeta.originalname}`);

      const text = await extractTextFromFile(filePath, fileMeta.originalname);

      // Split text into sentences/paragraphs by newline or period
      const parts = text.split(/[\n\.]/).map(p => p.trim()).filter(p => p.length > 20);

      // Keywords from question, ignoring short/common words
      const qWords = qText.split(' ').filter(w => w.length > 3);

      // Find first part containing any keyword
      let relevantPart = null;
      for (let word of qWords) {
        relevantPart = parts.find(p => p.toLowerCase().includes(word));
        if (relevantPart) break;
      }

      if (relevantPart) {
        return res.json({ answer: `From notes (${fileMeta.originalname}):\n${relevantPart}` });
      } else {
        // Fallback: first 300 characters snippet
        const snippet = text.length > 300 ? text.slice(0, 300) + '...' : text;
        return res.json({ answer: `From notes (${fileMeta.originalname}):\n${snippet}` });
      }
    }

    // 3. No answers found
    res.json({ answer: 'No valid answer found in knowledge base or notes.' });

  } catch (error) {
    console.error('Error in /ask:', error);
    res.json({ answer: 'Error processing the question.' });
  }
});

// Upload notes endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded.' });
    }
    const { subject = '', topic = '' } = req.body;

    filesMeta.unshift({
      filename: req.file.filename,
      originalname: req.file.originalname,
      subject,
      topic
    });
    console.log(`Uploaded file: ${req.file.originalname}, subject: ${subject}, topic: ${topic}`);

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to upload file.' });
  }
});

// Return uploaded files metadata
app.get('/files', (req, res) => {
  res.json(filesMeta);
});

// Serve uploaded files for download/view
app.get('/file/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);
  res.sendFile(filePath, err => {
    if (err) {
      console.error(`Error sending file ${filename}:`, err);
      res.status(404).send('File not found.');
    }
  });
});

// Health check route
app.get('/', (req, res) => res.send('VTU Tutor API running!'));

// Start server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API server started on port ${port}`);
});
