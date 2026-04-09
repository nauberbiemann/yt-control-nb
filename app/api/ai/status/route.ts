import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasOpenAI: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sua_chave_aqui',
    hasGemini: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'sua_chave_aqui'
  });
}
