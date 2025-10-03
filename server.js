// server.js
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import twilio from 'twilio';
import OpenAI from 'openai';

const app = express();

// Twilio posts form-encoded data
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json()); // harmless if Twilio doesn't send JSON

// --- OpenAI client ---
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Receptionist behavior (system prompt) ---
const SYSTEM_PROMPT =
  "You are a warm, professional phone receptionist for the business. " +
  "Keep replies short (1–2 sentences). " +
  "If the caller asks to book or leave a message, politely collect their name, phone number, and reason for calling. " +
  "Never give legal/medical advice. If unsure, offer a callback from the team.";

// Simple per-call memory (in-memory, cleared when process restarts)
const sessions = new Map();

function getHistory(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, [{ role: 'system', content: SYSTEM_PROMPT }]);
  }
  return sessions.get(callSid);
}

function addMessage(callSid, role, content) {
  const hist = getHistory(callSid);
  hist.push({ role, content });
  // keep memory small
  if (hist.length > 12) sessions.set(callSid, [hist[0], ...hist.slice(-11)]);
}

// --- Health check ---
app.get('/', (req, res) => {
  res.status(200).send('AI receptionist running');
});

// --- First step: greet and start a Gather ---
app.post('/voice', (req, res) => {
  const vr = new twilio.twiml.VoiceResponse();

  // Greet and ask how to help
  const gather = vr.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/handle-speech',
    method: 'POST',
    language: 'en-US'
  });

  gather.say('Hello, thanks for calling. How can I help you today?', { voice: 'alice' });

  // If no input, loop back
  vr.redirect('/voice');

  res.type('text/xml').send(vr.toString());
});

// --- Handle speech from Twilio, call GPT, reply, and keep gathering ---
app.post('/handle-speech', async (req, res) => {
  const callSid = req.body.CallSid;
  const speech = (req.body.SpeechResult || '').trim();

  // Build a response TwiML
  const vr = new twilio.twiml.VoiceResponse();

  if (!speech) {
    vr.say("Sorry, I didn't catch that. Could you repeat that?", { voice: 'alice' });
    vr.redirect('/voice');
    return res.type('text/xml').send(vr.toString());
  }

  console.log('Caller said:', speech);

  // Update memory
  addMessage(callSid, 'user', speech);

  let reply = "Thanks, I’ll make a note of that.";
  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: getHistory(callSid),
      max_tokens: 120,
      temperature: 0.6,
    });

    reply = (completion.choices?.[0]?.message?.content || reply).trim();
    addMessage(callSid, 'assistant', reply);
  } catch (err) {
    console.error('OpenAI error:', err?.message || err);
    reply = "I'm sorry, I'm having trouble answering right now.";
  }

  // Say the AI reply and keep the conversation open with another Gather
  const gather = vr.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/handle-speech',
    method: 'POST',
    language: 'en-US'
  });

  gather.say(reply, { voice: 'alice' });

  // Fallback if no speech on this turn
  vr.redirect('/voice');

  res.type('text/xml').send(vr.toString());
});

// --- Optional: clear memory if you set Twilio Status Callback to this URL ---
app.post('/call-complete', (req, res) => {
  const sid = req.body.CallSid;
  if (sid) sessions.delete(sid);
  res.sendStatus(200);
});

// --- Start server ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`AI Receptionist running on port ${PORT}`);
});

