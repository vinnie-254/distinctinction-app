require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static('public'));
app.use('/three', express.static(__dirname + '/node_modules/three'));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Helper: Uses Interactions API with strict JSON schema for Computerized Textbook Diagrams
async function generateWithFallback(prompt) {
  const models = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  let lastError;

  const responseSchema = {
    type: 'object',
    properties: {
      topicTitle: { type: 'string' },
      summaryPoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } }
          },
          required: ['heading', 'bullets']
        }
      },
      flashcards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            front: { type: 'string' },
            back: { type: 'string' }
          },
          required: ['front', 'back']
        }
      },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' }
          },
          required: ['question', 'answer']
        }
      },
      textbookDiagram: {
        type: 'object',
        properties: {
          figureNumber: { type: 'string' },
          title: { type: 'string' },
          caption: { type: 'string' },
          layoutType: { type: 'string' },
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                label: { type: 'string' },
                sublabel: { type: 'string' },
                detail: { type: 'string' },
                color: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                shape: { type: 'string' }
              },
              required: ['id', 'label', 'sublabel', 'detail', 'color', 'x', 'y', 'shape']
            }
          },
          arrows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'integer' },
                to: { type: 'integer' },
                actionLabel: { type: 'string' },
                dashed: { type: 'boolean' }
              },
              required: ['from', 'to', 'actionLabel', 'dashed']
            }
          }
        },
        required: ['figureNumber', 'title', 'caption', 'layoutType', 'nodes', 'arrows']
      }
    },
    required: ['topicTitle', 'summaryPoints', 'flashcards', 'questions', 'textbookDiagram']
  };

  for (const modelName of models) {
    try {
      const interaction = await ai.interactions.create({
        model: modelName,
        input: prompt,
        response_format: responseSchema
      });
      const textOutput = interaction.outputs?.find(o => o.type === 'text')?.text || interaction.output_text;
      if (textOutput) return textOutput;
    } catch (err) {
      console.warn(`Model ${modelName} busy, trying fallback...`, err.message);
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

// 1. Upload & AI Generation Endpoint
app.post('/api/generate', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    let extractedText = '';
    if (req.file.mimetype === 'application/pdf') {
      const pdfData = await pdfParse(req.file.buffer);
      extractedText = pdfData.text;
    } else {
      extractedText = req.file.buffer.toString('utf-8');
    }

    if (!extractedText || !extractedText.trim()) {
      return res.status(400).json({ error: 'Could not read text from this PDF.' });
    }

    const prompt = `
      You are a senior textbook medical/scientific/academic illustrator. Analyze the uploaded study material thoroughly and return ONLY valid JSON.
      Requirements:
      1. "summaryPoints": Cover EVERY aspect, definition, process, and detail in the text using rich bullet points grouped by clear headings.
      2. "flashcards": Generate exactly 10 high-yield flashcards.
      3. "questions": Generate exactly 20 diverse, exam-standard practice questions with thorough answers.
      4. "textbookDiagram": Design a crystal-clear, computerized textbook figure (like Pearson, Campbell Biology, or engineering schematics) with 5 to 8 key components:
         - "figureNumber": e.g. "Figure 1.1"
         - "title": Formal academic figure title
         - "caption": Clear 1-2 sentence textbook figure legend explaining the diagram
         - "layoutType": Choose "flowchart", "cycle", "hierarchy", or "system"
         - "nodes": Position each node cleanly on a 1000x560 canvas (x between 140 and 860, y between 110 and 450) arranged in an organized grid, cycle, or top-down tree so NO boxes overlap (keep at least 210px horizontal or 130px vertical spacing).
           * "id": 0, 1, 2...
           * "label": Short anatomical/technical title (2-4 words)
           * "sublabel": Key role or formula (2-5 words)
           * "detail": Full textbook annotation (1-2 sentences)
           * "color": Academic palette hex ("#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2")
           * "shape": "rect" (process/organ box), "pill" (start/end stage), "circle" (hub/atom/cell), or "diamond" (decision/checkpoint)
         - "arrows": Directed connectors between node IDs with a concise "actionLabel" (1-3 words written along the arrow) and "dashed" (true for feedback/secondary links, false for primary flow).

      Study Material: ${extractedText.slice(0, 28000)}
    `;

    const rawText = await generateWithFallback(prompt);
    const cleanJson = rawText.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(cleanJson));
  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate study materials' });
  }
});

// 2. Student Sign In / Auto Sign Up Endpoint (Supabase)
app.post('/api/auth', async (req, res) => {
  const { email, password } = req.body;
  try {
    let { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

    if (error) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (created.error) return res.status(400).json({ error: created.error.message });
      data = { user: created.data.user };
      await supabaseAdmin.from('profiles').upsert({ id: data.user.id, email, is_pro: false });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_pro')
      .eq('id', data.user.id)
      .single();

    const { data: banks } = await supabaseAdmin
      .from('question_banks')
      .select('*')
      .eq('user_id', data.user.id)
      .order('created_at', { ascending: false });

    res.json({
      user: { id: data.user.id, email: data.user.email },
      isPro: Boolean(profile?.is_pro),
      banks: banks || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Save Question Bank Endpoint
app.post('/api/qbank', async (req, res) => {
  const { userId, title, questions } = req.body;
  try {
    await supabaseAdmin.from('question_banks').insert([{ user_id: userId, title, questions }]);
    const { data: banks } = await supabaseAdmin
      .from('question_banks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    res.json({ banks: banks || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Paystack Checkout & Payment Verification
const PAYSTACK_BASE = ['https://api', 'paystack', 'co'].join('.');

app.post('/api/paystack/initialize', async (req, res) => {
  const { email, userId } = req.body;
  const origin = req.headers.origin || 'http://localhost:3000';
  try {
    const initRes = await fetch(PAYSTACK_BASE + '/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount: 500 * 100, // KES 500
        currency: 'KES',
        channels: ['mobile_money', 'card'],
        callback_url: `${origin}/?userId=${encodeURIComponent(userId)}`,
        metadata: { userId }
      })
    });
    const data = await initRes.json();
    if (data.status && data.data.authorization_url) {
      res.json({ authorization_url: data.data.authorization_url });
    } else {
      res.status(400).json({ error: data.message || 'Could not start Paystack checkout' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/verify-payment', async (req, res) => {
  const { reference, userId } = req.body;
  try {
    const verifyRes = await fetch(PAYSTACK_BASE + '/transaction/verify/' + encodeURIComponent(reference), {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });
    const data = await verifyRes.json();

    if (data.status && data.data.status === 'success') {
      if (userId) {

await supabaseAdmin.from('profiles').upsert({ id: userId, is_pro: true });
}
res.json({ verified: true });
} else {
res.json({ verified: false });
}
} catch (error) {
res.status(500).json({ verified: false });
}
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Distinction Pro running on port ' + PORT));
