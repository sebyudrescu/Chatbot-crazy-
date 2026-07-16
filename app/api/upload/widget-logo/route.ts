import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('logo') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'Nessun file fornito' },
        { status: 400 }
      );
    }

    // Validazione file
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo di file non supportato. Usa PNG, JPG, GIF o SVG.' },
        { status: 400 }
      );
    }

    // Dimensione max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File troppo grande. Max 5MB.' },
        { status: 400 }
      );
    }

    // Crea directory se non esiste
    const uploadsDir = path.join(process.cwd(), 'public', 'widget-logos');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Nome file unico
    const timestamp = Date.now();
    const extension = path.extname(file.name);
    const fileName = `logo-${timestamp}${extension}`;
    const filePath = path.join(uploadsDir, fileName);

    // Salva file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    fs.writeFileSync(filePath, buffer);

    // URL pubblico
    const publicUrl = `/widget-logos/${fileName}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName: fileName
    });

  } catch (error) {
    console.error('Error uploading logo:', error);
    return NextResponse.json(
      { error: 'Errore nel caricamento del file' },
      { status: 500 }
    );
  }
}