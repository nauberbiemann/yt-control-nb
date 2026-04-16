import { NextRequest, NextResponse } from 'next/server';
import { parseGoogleSheetsReference } from '@/lib/google-sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const looksLikeCsv = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const firstChunk = trimmed.slice(0, 240).toLowerCase();
  if (firstChunk.startsWith('<!doctype html') || firstChunk.startsWith('<html')) return false;
  return /,|;|\t/.test(trimmed.split(/\r?\n/, 1)[0] || '');
};

const fetchSheetCandidate = async (url: string) => {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 Codex Analytics Importer',
    },
    redirect: 'follow',
  });

  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    text,
    contentType: response.headers.get('content-type') || '',
    finalUrl: response.url,
  };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sheetUrl = typeof body?.sheetUrl === 'string' ? body.sheetUrl : '';
    const reference = parseGoogleSheetsReference(sheetUrl);

    const attempts = [
      { label: 'export', url: reference.exportUrl },
      { label: 'gviz', url: reference.gvizUrl },
    ];

    let csvText = '';
    let successMeta: { label: string; finalUrl: string } | null = null;
    let lastFailure: { status: number; contentType: string; finalUrl: string } | null = null;

    for (const attempt of attempts) {
      const result = await fetchSheetCandidate(attempt.url);
      if (result.ok && looksLikeCsv(result.text)) {
        csvText = result.text;
        successMeta = { label: attempt.label, finalUrl: result.finalUrl };
        break;
      }

      lastFailure = {
        status: result.status,
        contentType: result.contentType,
        finalUrl: result.finalUrl,
      };
    }

    if (!csvText.trim()) {
      return NextResponse.json(
        {
          error:
            'A planilha abre normalmente, mas o Google não entregou a aba em CSV bruto. Tente usar o link completo da aba "Dados da tabela" com #gid=..., ou publique a planilha para leitura na web.',
          debug: lastFailure,
          reference,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      csvText,
      reference,
      sourceLabel: `Google Sheets • gid ${reference.gid}`,
      transport: successMeta,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Não foi possível processar o link do Google Sheets.';

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
