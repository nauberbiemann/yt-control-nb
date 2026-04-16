export interface GoogleSheetsReference {
  spreadsheetId: string;
  gid: string;
  exportUrl: string;
  gvizUrl: string;
  canonicalUrl: string;
}

const GOOGLE_SHEETS_HOSTS = new Set(['docs.google.com', 'drive.google.com']);

const buildReference = (spreadsheetId: string, gid: string): GoogleSheetsReference => ({
  spreadsheetId,
  gid,
  exportUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
  gvizUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
  canonicalUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`,
});

const readGidFromHash = (hash: string) => {
  const match = hash.match(/gid=(\d+)/);
  return match?.[1] || '';
};

export const parseGoogleSheetsReference = (input: string): GoogleSheetsReference => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Cole o link da planilha do Google Sheets.');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('O link informado não é uma URL válida do Google Sheets.');
  }

  if (!GOOGLE_SHEETS_HOSTS.has(url.hostname)) {
    throw new Error('Use um link de planilha do Google Sheets compartilhado em leitura.');
  }

  const pathMatch = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const spreadsheetId = pathMatch?.[1];
  if (!spreadsheetId) {
    throw new Error('Não consegui identificar o ID da planilha nesse link.');
  }

  const gid =
    url.searchParams.get('gid') ||
    url.searchParams.get('sheet') ||
    readGidFromHash(url.hash) ||
    '0';

  return buildReference(spreadsheetId, gid);
};
