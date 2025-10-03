// server.js
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import twilio from 'twilio';
import OpenAI from 'openai';

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// 🔑 OpenAI
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🎯 Receptionist behavior
const SYSTEM_PROMPT =
  "You are a warm, professional phone receptionist for the business. " +
  "Keep replies short (1–2 sentences). " +
  "If the caller wants to book or leave a message, politely collect their name, phone number, and reason for calling. " +
  "Never give legal/medical advice. If unsure, offer a callback from the team.";

// 🧠 Simple per-call memory (RAM only)
const sessions = new Map();
function getHistory(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, [{ role: 'system', content: SYSTEM_PROMPT }]);
  }
  return sessions.get(callSid);
}
function addMessage(callSid, role, content) {
  const h = getHistory(callSid);
  h.push({ role, content });
  if (h.length > 12) sessions.set(callSid, [h[0], ...h.slice(-11)]);
}

// Health check
app.get('/', (_req, res) => res.send('AI receptionist running'));

// 1) Start the conversation and ask for speech
app.post('/voice', (req, res) => {
  const vr = new twilio.twiml.VoiceResponse();
  const gather = vr.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/handle-speech',
    method: 'POST',
    language: 'en-US'
  });
  gather.say('Hello, this is your AI receptionist. How can I help you today?');
  // If nothing heard, try again
  vr.redirect('/voice');
  res.type('text/xml').send(vr.toString());
});

// 2) Handle caller speech -> GPT -> speak reply -> loop
app.post('/handle-speech', async (req, res) => {
  const callSid = req.body.CallSid;
  const speech = (req.body.SpeechResult || '').trim();
  const fromNumber = req.body.From;

  const vr = new twilio.twiml.VoiceResponse();

  if (!speech) {
    vr.say("Sorry, I didn't catch that. Could you repeat?");
    vr.redirect('/voice');
    return res.type('text/xml').send(vr.toString());
  }

  console.log(`[${callSid}] From ${fromNumber} said:`, speech);
  addMessage(callSid, 'user', `Caller (${fromNumber}) said: ${speech}`);

  let reply = "Thanks, I’ll pass that along.";
  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: getHistory(callSid),
      max_tokens: 90,
      temperature: 0.6,
    });
    reply = (completion.choices?.[0]?.message?.content || '').trim();
    addMessage(callSid, 'assistant', reply);
  } catch (err) {
    console.error('OpenAI error:', err?.message || err);
    reply = "Sorry, I'm having trouble right now.";
  }

  // Say the reply, then prompt again to keep the conversation going
  vr.say(reply);

  const gather = vr.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/handle-speech',
    method: 'POST',
    language: 'en-US'
  });
  gather.say('Anything else I can help you with?');

  res.type('text/xml').send(vr.toString());
});

// (Optional) Clear memory when the call ends (if you configure Twilio Status Callback to this URL)
app.post('/call-complete', (req, res) => {
  if (req.body.CallSid) sessions.delete(req.body.CallSid);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`AI Receptionist running on port ${PORT}`));

