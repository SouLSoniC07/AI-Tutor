require('dotenv').config(); // To load your OpenAI key
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const cosineSimilarity = require('compute-cosine-similarity');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());
app.use(cors());

// File upload setup
const upload = multer({ dest: 'uploads/' });
const filesMeta = [];

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const mockQA = [
  { question: 'binary search tree', answer: 'A BST is a data structure where left < parent < right.' },
  { question: 'normalization', answer: 'It means organizing DB tables to reduce redundancy.' }
];

// Helper: extract text from PDF or txt
async function extractTextFromFile(filePath, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } else if (ext === '.txt') {
    return fs.readFileSync(filePath, 'utf8');
  } else {
    return ''; // For this example, pptx disabled for simplicity; add as needed
  }
}

// Helper: Get embeddings from local Python HuggingFace service
async function getEmbeddingsHuggingFace(texts) {
  const response = await axios.post('http://localhost:5678/embed', { texts });
  return response.data.embeddings;
}

// Optional: Use OpenAI for the RAG step
async function answerWithOpenAIGPT(question, context) {
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "You are a helpful tutor. Use ONLY the provided notes context." },
      { role: "user", content: `NOTES:\n${context}\nQUESTION: ${question}` }
    ]
  });
  return completion.choices[0].message.content.trim();
}

// /ask endpoint: semantic search + (optional) LLM answer
app.post('/ask', async (req, res) => {
  try {
    const question = req.body.question || '';
    // 1. Try direct mock QA
    const found = mockQA.find(q => question.toLowerCase().includes(q.question));
    if (found) return res.json({ answer: found.answer });

    // 2. Extract from latest note using semantic search
    if (filesMeta.length > 0) {
      const fileMeta = filesMeta[0];
      const filePath = path.join(__dirname, 'uploads', fileMeta.filename);
      const text = await extractTextFromFile(filePath, fileMeta.originalname);
      // Split into paragraphs (double newlines preferred) or sentences
      const chunks = text.split(/\n{2,}|\. /).map(c => c.trim()).filter(c => c.length > 32);

      // Get embeddings for all chunks and question
      const paraEmbeddings = await getEmbeddingsHuggingFace(chunks);
      const questionEmbedding = (await getEmbeddingsHuggingFace([question]))[0];

      // Cosine similarity to find best matching chunk
      let maxScore = -Infinity, bestChunk = '';
      paraEmbeddings.forEach((emb, idx) => {
        const score = cosineSimilarity(questionEmbedding, emb);
        if (score > maxScore) {
          maxScore = score;
          bestChunk = chunks[idx];
        }
      });

      // Optional: Use OpenAI for better answer (comment out if you want plain text excerpt)
      // const aiAnswer = await answerWithOpenAIGPT(question, bestChunk);
      // return res.json({ answer: aiAnswer });

      // Default: Return the most relevant chunk from notes
      return res.json({ answer: `From notes (${fileMeta.originalname}):\n${bestChunk}` });
    }

    res.json({ answer: 'No valid answer found in knowledge base or notes.' });
  } catch (error) {
    console.error(error);
    res.json({ answer: 'Error processing your question.' });
  }
});

// Upload and other endpoints (same as before)
app.post('/upload', upload.single('file'), (req, res) => {
  const { subject = '', topic = '' } = req.body;
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
app.get('/', (req, res) => res.send('VTU Tutor API running!'));
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API server started on port ${port}`));
