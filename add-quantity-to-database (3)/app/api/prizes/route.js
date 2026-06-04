import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const prizes = await query('SELECT id, name, description FROM prizes ORDER BY id');
    
    return Response.json({
      success: true,
      data: prizes,
    });
  } catch (error) {
    console.error('[v0] Prizes API Error:', error);
    return Response.json({
      success: false,
      message: 'Gagal mengambil data hadiah',
      error: error.message,
    }, { status: 500 });
  }
}
