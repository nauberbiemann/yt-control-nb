import { NextRequest, NextResponse } from 'next/server';
import { resolveModel, isReasoningModel } from '@/lib/ai-config';

interface GatekeeperRequest {
  theme: string;
  projectDNA: {
    puc?: string;
    persona?: any;
    niche?: string;
    pillars?: string[];
  };
  refactoredTheme: string;
  reasoning?: string;
  isFallback: boolean;
  fallbackReason?: 'no_key' | 'parse_error';
  engine?: string;
  model?: string;
  apiKey?: string;
}

function localGatekeeperFallback(theme: string, projectDNA: GatekeeperRequest['projectDNA']) {
  const puc = projectDNA.puc || '';
  const niche = projectDNA.niche || '';

  // Simple keyword-based scoring for fallback
  const themeWords = theme.toLowerCase().split(/\s+/);
  const pucWords = puc.toLowerCase().split(/\s+/);
  const nicheWords = niche.toLowerCase().split(/\s+/);

  const allContextWords = [...pucWords, ...nicheWords];
  const matchCount = themeWords.filter(w => allContextWords.some(c => c.includes(w) || w.includes(c) && c.length > 3)).length;
  const matchScore = Math.min(100, Math.max(20, Math.round((matchCount / Math.max(themeWords.length, 1)) * 100) + 30));

  const pivotSuggestion = matchScore < 60
    ? `Refatorar "${theme}" para incluir o léxico técnico do nicho "${niche || 'do projeto'}" e conectar diretamente à PUC: "${puc}".`
    : `Tema adequado. Considere aprofundar o ângulo de "${puc}" para maximizar o fit estratégico.`;

  return {
    matchScore,
    isValid: matchScore >= 40,
    pivotSuggestion,
    refactoredTheme: matchScore < 60
      ? `${theme} — Aplicado ao Contexto de ${niche || 'Especialista'}`
      : theme,
    isFallback: true,
    fallbackReason: 'no_key', // This is overridden if called from a parse catch block
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: GatekeeperRequest = await req.json();
    const { theme, projectDNA, engine, model, apiKey } = body;

    if (!theme || !projectDNA) {
      return NextResponse.json({ error: 'theme and projectDNA are required' }, { status: 400 });
    }

    // Determine API key from request or environment
    let resolvedKey = '';
    if (engine === 'openai') {
      resolvedKey = apiKey || process.env.OPENAI_API_KEY || '';
    } else if (engine === 'gemini') {
      resolvedKey = apiKey || process.env.GEMINI_API_KEY || '';
    }

    // If no API key, return local fallback with a warning
    if (!resolvedKey || resolvedKey === 'sua_chave_aqui') {
      const fallback = localGatekeeperFallback(theme, projectDNA);
      return NextResponse.json({ ...fallback, isFallback: true }, { status: 200 });
    }

    // --- AI-Powered Gatekeeper ---
    const gatekeeperPrompt = `You are a strategic content architect. Your job is to validate whether a video theme is aligned with a project's strategic DNA.

PROJECT DNA:
- PUC (Unique Content Promise): "${projectDNA.puc || 'Not defined'}"
- Target Persona: ${JSON.stringify(projectDNA.persona || {})}
- Niche: "${projectDNA.niche || 'Not defined'}"
- Editorial Pillars: ${JSON.stringify(projectDNA.pillars || [])}

THEME TO VALIDATE: "${theme}"

Respond ONLY with raw JSON (no markdown, no explanation), using this exact structure:
{
  "matchScore": <number 0-100>,
  "isValid": <boolean, true if matchScore >= 40>,
  "pivotSuggestion": "<string: In 2-3 sentences, provide strategic advice on how to improve or refine this theme for the channel's DNA. This is a TIP, NOT a new title.>",
  "refactoredTheme": "<string: A rewritten version of the theme title ONLY. Must be short (max 12 words), punchy, and keep the SAME structural format as the original (e.g., if original has 'X: Y', keep that format). Use the project's technical lexicon. Write in the SAME language as the input.>",
  "reasoning": "<string: 1-2 sentences explaining the score.>"
}`;

    const apiModel = resolveModel(model || 'gemini-2.5-flash');

    let responseData: any;

    if (engine === 'gemini') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${resolvedKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: gatekeeperPrompt }] }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 1024,
              response_mime_type: 'application/json',
            },
          }),
        }
      );
      const raw = await response.json();
      if (!response.ok) return NextResponse.json(raw, { status: response.status });
      const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        responseData = JSON.parse(cleanText);
      } catch (e) {
        console.warn('[Gatekeeper Gemini] Invalid JSON returned. Using fallback.', { cleanText });
        const fallback = localGatekeeperFallback(theme, projectDNA);
        return NextResponse.json({ ...fallback, fallbackReason: 'parse_error' }, { status: 200 });
      }
    } else {
      const supportsTemp = !isReasoningModel(model || '');
      const requestBody: any = {
        model: apiModel,
        messages: [{ role: 'system', content: gatekeeperPrompt }],
        response_format: { type: 'json_object' },
      };
      if (supportsTemp) requestBody.temperature = 0.4;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resolvedKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      const raw = await response.json();
      if (!response.ok) return NextResponse.json(raw, { status: response.status });
      const text = raw?.choices?.[0]?.message?.content || '{}';
      try {
        responseData = JSON.parse(text);
      } catch (e) {
        console.warn('[Gatekeeper OpenAI] Invalid JSON returned. Using fallback.', { text });
        const fallback = localGatekeeperFallback(theme, projectDNA);
        return NextResponse.json({ ...fallback, fallbackReason: 'parse_error' }, { status: 200 });
      }
    }

    return NextResponse.json({ ...responseData, isFallback: false });
  } catch (error: any) {
    console.error('[Gatekeeper API Error]', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
