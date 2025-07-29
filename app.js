const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// Storage for uploaded files
const upload = multer({ dest: 'uploads/' });
const filesMeta = [];

const mockQA = [
  { question: 'binary search tree', answer: 'A BST is a data structure where left < parent < right.' },
  { question: 'normalization', answer: 'It means organizing DB tables to reduce redundancy.' }
];

app.post('/ask', (req, res) => {
  let qText = req.body.question.toLowerCase();
  let found = mockQA.find(q => qText.includes(q.question));
  if (found) return res.json({ answer: found.answer });
  if (filesMeta.length > 0) {
    // Try reading recent note (for text only)
    let filePath = path.join(__dirname, 'uploads', filesMeta[0].filename);
    try {
      let text = fs.readFileSync(filePath, 'utf8');
      return res.json({ answer: 'From notes: ' + text.slice(0, 150) + '...' });
    } catch {
      return res.json({ answer: 'Note uploaded but not readable as text.' });
    }
  }
  res.json({ answer: "No valid answer in knowledge base." });
});

app.post('/upload', upload.single('file'), (req, res) => {
  const { subject, topic } = req.body;
  filesMeta.unshift({
    filename: req.file.filename,
    originalname: req.file.originalname,
    subject,
    topic
  });
  res.json({ status: 'ok' });
});

app.get('/files', (req, res) => res.json(filesMeta));
app.get('/file/:filename', (req, res) =>
  res.sendFile(path.join(__dirname, 'uploads', req.params.filename))
);

// Health check for Render (important!)
app.get('/', (req, res) => res.send('VTU Tutor API running!'));
const port = process.env.PORT || 4000;
app.listen(port, () => console.log("API server started on port", port));
