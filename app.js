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

// Multer config for file uploads
const upload = multer({ dest: 'uploads/' });

// Store uploaded files metadata in memory (restart clears it)
const filesMeta = [];

const mockQA = [
  { question: 'binary search tree', answer: 'A BST is a data structure where left < parent < right.' },
  { question: 'normalization', answer: 'It means organizing DB tables to reduce redundancy.' },
];

// Helper: Extract text from .pdf, .pptx, and plain text
async function extractTextFromFile(filePath, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  console.log(`Extracting text from file extension: ${ext}`);

  if (ext === '.pdf') {
    console.log('Parsing PDF with pdf-parse...');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } else if (ext === '.pptx') {
    console.log('Parsing PPTX with pptx2json...');
    try {
      const parser = new PPTXParser();
      const data = await parser.parse(filePath);

      // data.slides is an array of slides
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

// /ask route: answer questions via mockQA or uploaded notes
app.post('/ask', async (req, res) => {
  try {
    const qText = req.body.question ? req.body.question.toLowerCase() : '';
    console.log(`Received question: "${qText}"`);

    // Check mock Q&A first
    const found = mockQA.find(q => qText.includes(q.question));
    if (found) {
      console.log('Returning mock answer.');
      return res.json({ answer: found.answer });
    }

    // No mock answer? Try from latest uploaded note
    if (filesMeta.length > 0) {
      const fileMeta = filesMeta[0];
      const filePath = path.join(__dirname, 'uploads', fileMeta.filename);
      console.log(`Extracting from uploaded file: ${fileMeta.originalname}`);

      const text = await extractTextFromFile(filePath, fileMeta.originalname);

      // Limit answer length for readability
      const snippet = text.length > 300 ? text.slice(0, 300) + '...' : text;

      return res.json({ answer: `From notes (${fileMeta.originalname}):\n${snippet}` });
    }

    return res.json({ answer: 'No valid answer found in knowledge base or notes.' });
    
  } catch (error) {
    console.error('Error in /ask:', error);
    res.json({ answer: 'Error processing the question.' });
  }
});

// /upload route: store uploaded notes metadata
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
      topic,
    });
    console.log(`File uploaded: ${req.file.originalname}, subject: ${subject}, topic: ${topic}`);

    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to upload file.' });
  }
});

// /files route: return metadata of uploaded files
app.get('/files', (req, res) => {
  res.json(filesMeta);
});

// /file/:filename route: serve uploaded file
app.get('/file/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);
  
  res.sendFile(filePath, err => {
    if (err) {
      console.error('Error sending file:', err);
      res.status(404).send('File not found.');
    }
  });
});

// Health check endpoint
app.get('/', (req, res) => res.send('VTU Tutor API running!'));

// Start server
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API server started on port ${port}`));
