import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const filePath = path.join(process.cwd(), 'debug_localStorage.json');
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return NextResponse.json({ ok: true, path: filePath });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
