// /api/generate-exam.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getSpec(modeRaw) {
  const mode = String(modeRaw || '').toLowerCase();
  if (mode === 'pca') {
    return {
      exam: 'PCA',
      subject: 'UP',
      sections: [
        { topic: 'lectura', title: 'Español' },
        { topic: 'algebra', title: 'Álgebra' }
      ],
      totalTimeMin: 120
    };
  }
  if (mode === 'pcg') {
    return {
      exam: 'PCG',
      subject: 'UP',
      sections: [
        { topic: 'biologia', title: 'Biología' },
        { topic: 'quimica', title: 'Química' },
        { topic: 'fisica', title: 'Física' },
        { topic: 'algebra', title: 'Álgebra' }
      ],
      totalTimeMin: 120
    };
  }
  // por defecto PAA (UTP)
  return {
    exam: 'PAA',
    subject: 'UTP',
    sections: [
      { topic: 'algebra', title: 'Álgebra' },
      { topic: 'lectura', title: 'Lectura' }
    ],
    totalTimeMin: 120
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const url = new URL(req.url, 'http://localhost'); // fallback para leer query si viene
    const mode = body.mode || url.searchParams.get('mode') || 'paa';
    const countPerSection = Math.max(1, parseInt(body.count_per_section || 10, 10));

    const spec = getSpec(mode);

    // Verificamos disponibilidad por tema
    const missing = [];
    for (const sec of spec.sections) {
      const { count, error } = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('exam', spec.exam)
        .eq('subject', spec.subject)
        .eq('topic', sec.topic)
        .eq('active', true);

      if (error) {
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: error.message });
      }
      if ((count || 0) < countPerSection) {
        missing.push({ topic: sec.topic, have: count || 0, need: countPerSection });
      }
    }

    if (missing.length) {
      return res.status(200).json({ ok: false, error: 'BANK_SHORTAGE', missing, mode, exam: spec.exam, subject: spec.subject });
    }

    // Traemos pool y barajamos en memoria
    const sections = [];
    for (const sec of spec.sections) {
      const poolSize = Math.max(countPerSection * 4, 60);
      const { data, error } = await supabase
        .from('questions')
        .select('id, prompt, choices, answer_index, explanation, topic')
        .eq('exam', spec.exam)
        .eq('subject', spec.subject)
        .eq('topic', sec.topic)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(poolSize);

      if (error) {
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: error.message });
      }
      const items = shuffle(data || []).slice(0, countPerSection).map((q, i) => ({
        id: q.id, n: i + 1, prompt: q.prompt,
        choices: q.choices, answer_index: q.answer_index,
        explanation: q.explanation, topic: q.topic
      }));

      sections.push({ title: sec.title, topic: sec.topic, count: countPerSection, items });
    }

    return res.status(200).json({
      ok: true,
      mode, exam: spec.exam, subject: spec.subject,
      sections,
      total_time_seconds: spec.totalTimeMin * 60
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: e.message });
  }
}

