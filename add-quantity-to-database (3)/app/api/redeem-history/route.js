import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const history = await query(
      `SELECT 
        id,
        nik,
        employee_name,
        departemen,
        prize_name,
        redeemed_at
       FROM redeem_history 
       ORDER BY redeemed_at DESC`
    );

    return Response.json({
      success: true,
      data: history,
      total: history.length,
    });
  } catch (error) {
    console.error('[v0] History API Error:', error);
    return Response.json({
      success: false,
      message: 'Gagal mengambil riwayat redeem',
      error: error.message,
    }, { status: 500 });
  }
}
