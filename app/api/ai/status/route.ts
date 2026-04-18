import { NextResponse } from 'next/server';

export async function GET() {
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';

  return NextResponse.json({
    hasOpenAI: !!openaiKey && openaiKey !== 'sua_chave_aqui',
    hasGemini: !!geminiKey && geminiKey !== 'sua_chave_aqui',
    envKeyNames: {
      openai: process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : null,
      gemini: process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : process.env.GOOGLE_GEMINI_API_KEY ? 'GOOGLE_GEMINI_API_KEY' : null,
    }
  });
}
