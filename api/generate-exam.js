// /api/generate-exam.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// Utilidad para barajar en memoria
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Mapa de simuladores
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
  // default PAA
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

    // body: { count_per_section, difficulty, variant }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const url = new URL(req.headers.referer || req.headers.origin || 'http://dummy.local');
    const mode = url.searchParams.get('mode') || body.mode || 'paa';
    const spec = getSpec(mode);
    const countPerSection = Math.max(1, parseInt(body.count_per_section || 10, 10));

    // Para cada sección, primero contamos
    const missing = [];
    const perTopicQuestions = {};

    for (const sec of spec.sections) {
      // Contemos exacto
      const { data: countData, count, error: countErr } = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('exam', spec.exam)
        .eq('subject', spec.subject)
        .eq('topic', sec.topic)
        .eq('active', true);

      if (countErr) {
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: countErr.message });
      }
      if ((count || 0) < countPerSection) {
        missing.push({ topic: sec.topic, have: count || 0, need: countPerSection });
      }
    }

    if (missing.length) {
      return res.status(200).json({
        ok: false,
        error: 'BANK_SHORTAGE',
        missing
      });
    }

    // Traemos un “pool” amplio por tema (hasta 200) y barajamos en memoria
    for (const sec of spec.sections) {
      const { data, error } = await supabase
        .from('questions')
        .select('id, prompt, choices, answer_index, explanation, topic')
        .eq('exam', spec.exam)
        .eq('subject', spec.subject)
        .eq('topic', sec.topic)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(Math.max(countPerSection * 4, 60)); // pool

      if (error) {
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: error.message });
      }
      const pool = shuffle(data || []);
      perTopicQuestions[sec.topic] = pool.slice(0, countPerSection).map((q, idx) => ({
        id: q.id,
        n: idx + 1,
        prompt: q.prompt,
        choices: q.choices,
        answer_index: q.answer_index,
        explanation: q.explanation,
        topic: q.topic
      }));
    }

    // Construimos respuesta final
    const sections = spec.sections.map(sec => ({
      title: sec.title,
      topic: sec.topic,
      count: countPerSection,
      items: perTopicQuestions[sec.topic] || []
    }));

    return res.status(200).json({
      ok: true,
      exam: spec.exam,
      subject: spec.subject,
      mode,
      sections,
      total_time_seconds: spec.totalTimeMin * 60
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR', detail: e.message });
  }
}
