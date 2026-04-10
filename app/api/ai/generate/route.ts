import { NextRequest, NextResponse } from 'next/server';
import { resolveModel, isReasoningModel } from '@/lib/ai-config';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      engine, 
      model, 
      prompt, 
      apiKeyOverwrite,
      projectConfig,
      responseType = 'json'
    } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 1. Resolver Chave de API (Hybrid Model)
    // Prioridade: Overwrite (Frontend) > Environment (Server)
    let apiKey = '';
    if (engine === 'openai') {
      apiKey = apiKeyOverwrite || process.env.OPENAI_API_KEY || '';
    } else if (engine === 'gemini') {
      apiKey = apiKeyOverwrite || process.env.GEMINI_API_KEY || '';
    }

    if (!apiKey || apiKey === 'sua_chave_aqui') {
      return NextResponse.json({ 
        error: `API Key for ${engine} not configured. Set it in the UI or .env.local` 
      }, { status: 401 });
    }

    // 2. Resolver Modelo (DB-Driven Priority)
    // Se o projeto tiver um modelo específico configurado no banco, usamos ele.
    // Caso contrário, usamos o resolveModel (alias map).
    const apiModel = engine === 'gemini' 
      ? (projectConfig?.gemini_api_model || resolveModel(model))
      : (projectConfig?.openai_api_model || resolveModel(model));

    // 3. Execução da Chamada (Proxy)
    if (engine === 'gemini') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.9,
              topK: 1,
              topP: 1,
              maxOutputTokens: 2048,
              ...(responseType === 'json' ? { response_mime_type: 'application/json' } : {})
            }
          })
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json(data, { status: response.status });
      }
      return NextResponse.json(data);

    } else if (engine === 'openai') {
      const supportsTemperature = !isReasoningModel(model);
      const requestBody: any = {
        model: apiModel,
        messages: [{ role: 'system', content: prompt }],
      };
      if (supportsTemperature) requestBody.temperature = 0.8;
      if (responseType === 'json') requestBody.response_format = { type: 'json_object' };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json(data, { status: response.status });
      }
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Invalid engine' }, { status: 400 });

  } catch (error: any) {
    console.error('AI Proxy Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
