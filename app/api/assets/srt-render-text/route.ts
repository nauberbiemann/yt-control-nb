import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  buildPipelineResult,
  normalizeAssetType,
  parseCsvToRows,
  sanitizeDownloadFileStem,
  serializeRowsToCsv,
  type SrtAssetPipelineResult,
  type SrtAssetRow,
} from '@/lib/srt-asset-pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PIPELINE_ROOT = 'D:\\onedrive\\Downloads\\Produção em Massa\\1-ContentFlow\\assets\\ferramenta-legendas';
const LEGENDAS_DIR = path.join(PIPELINE_ROOT, 'legendas');
const RENDER_SCRIPT_PATH = path.join(PIPELINE_ROOT, 'renderizar_textos.py');
const RENDER_OUTPUTS_ROOT = path.join(PIPELINE_ROOT, 'remotion-renderer', 'renders');

const buildArtifactStem = (value: string) =>
  sanitizeDownloadFileStem((value || 'assets-srt').replace(/\.(srt|txt|csv)$/i, ''));

const ensurePipelinePaths = async () => {
  await stat(RENDER_SCRIPT_PATH);
  await mkdir(LEGENDAS_DIR, { recursive: true });
  await mkdir(RENDER_OUTPUTS_ROOT, { recursive: true });
};

const countLogOccurrences = (value: string, snippet: string) =>
  (value.match(new RegExp(snippet, 'gi')) || []).length;

const runCommand = (command: string, args: string[]) =>
  new Promise<{ stdout: string; stderr: string; commandLine: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: PIPELINE_ROOT,
      env: process.env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          stdout,
          stderr,
          commandLine: `${command} ${args.join(' ')}`,
        });
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `Falha ao executar ${command} (codigo ${code}).`));
    });
  });

const runRenderScript = async (csvFileName: string, overwrite: boolean) => {
  const candidates = [
    { command: 'py', args: ['-3', RENDER_SCRIPT_PATH, '--file', csvFileName] },
    { command: 'python', args: [RENDER_SCRIPT_PATH, '--file', csvFileName] },
    { command: 'python3', args: [RENDER_SCRIPT_PATH, '--file', csvFileName] },
  ].map((candidate) => ({
    ...candidate,
    args: overwrite ? [...candidate.args, '--overwrite'] : candidate.args,
  }));

  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      return await runCommand(candidate.command, candidate.args);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    `Nao foi possivel executar a etapa 5 com Python nesta maquina. Detalhes: ${failures.filter(Boolean).join(' | ')}`
  );
};

const getInputRows = (body: Record<string, unknown>): SrtAssetRow[] => {
  if (Array.isArray(body?.rows)) return body.rows as SrtAssetRow[];
  if (body?.pipeline && typeof body.pipeline === 'object' && Array.isArray((body.pipeline as SrtAssetPipelineResult).rows)) {
    return (body.pipeline as SrtAssetPipelineResult).rows;
  }
  return [];
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const inputRows = getInputRows(body);

    if (!inputRows.length) {
      return NextResponse.json({ error: 'O pipeline do SRT precisa existir antes da etapa 5.' }, { status: 400 });
    }

    await ensurePipelinePaths();

    const artifactStem = buildArtifactStem(
      String(body?.artifactStem || body?.themeTitle || body?.srtFileName || 'assets-srt'),
    );
    const csvFileName = `${artifactStem}.csv`;
    const csvPath = path.join(LEGENDAS_DIR, csvFileName);
    const outputDir = path.join(RENDER_OUTPUTS_ROOT, artifactStem);
    const overwrite = Boolean(body?.overwrite);

    const normalizedRows = inputRows.map((row) => ({
      ...row,
      asset: normalizeAssetType(row.asset),
    }));
    const csvContent = serializeRowsToCsv(normalizedRows);
    await writeFile(csvPath, `\uFEFF${csvContent}`, 'utf8');

    const textRows = normalizedRows.filter((row) => normalizeAssetType(row.asset) === 'texto');
    if (!textRows.length) {
      return NextResponse.json(
        buildPipelineResult(normalizedRows, {
          csvPath,
          outputDir,
          renderedCount: 0,
          reusedCount: 0,
          log: 'Nenhuma linha marcada como texto. A etapa 5 nao precisou renderizar assets.',
          lastRenderedAt: new Date().toISOString(),
        }),
      );
    }

    const runResult = await runRenderScript(csvFileName, overwrite);
    const updatedCsv = await readFile(csvPath, 'utf8');
    const updatedRows = parseCsvToRows(updatedCsv);
    const renderedCount = countLogOccurrences(runResult.stdout, 'render concluido');
    const reusedCount = countLogOccurrences(runResult.stdout, 'render existente reutilizado');

    return NextResponse.json(
      buildPipelineResult(updatedRows, {
        csvPath,
        outputDir,
        renderedCount,
        reusedCount,
        log: [runResult.commandLine, runResult.stdout.trim(), runResult.stderr.trim()].filter(Boolean).join('\n\n'),
        lastRenderedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error('[SRT Render Text] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao executar a etapa 5 do pipeline SRT.' },
      { status: 500 },
    );
  }
}
