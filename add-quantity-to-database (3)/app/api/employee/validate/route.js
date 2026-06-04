import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const { nik } = await request.json();

    if (!nik || typeof nik !== 'string') {
      return Response.json(
        {
          success: false,
          message: 'NIK harus disediakan',
        },
        { status: 400 }
      );
    }

    const inputNik = nik.trim().toUpperCase();

    if (!inputNik) {
      return Response.json(
        {
          success: false,
          message: 'NIK tidak boleh kosong',
        },
        { status: 400 }
      );
    }

    // Cari berdasarkan NIK asli
    const employees = await query(
      `
      SELECT id, nama, departemen, nik
      FROM employees
      WHERE UPPER(TRIM(nik)) = ?
      `,
      [inputNik]
    );

    if (employees.length === 0) {
      return Response.json(
        {
          success: false,
          message: 'NIK tidak terdaftar dalam database karyawan',
        },
        { status: 404 }
      );
    }

    const employee = employees[0];

    // Cek apakah sudah pernah redeem
    const redeemHistory = await query(
      `
      SELECT id
      FROM redeem_history
      WHERE UPPER(TRIM(nik)) = ?
      `,
      [employee.nik.trim().toUpperCase()]
    );

    if (redeemHistory.length > 0) {
      return Response.json(
        {
          success: false,
          message:
            'NIK ini sudah pernah melakukan redeem dan tidak bisa submit lagi',
        },
        { status: 403 }
      );
    }

    return Response.json({
      success: true,
      message: 'NIK valid dan belum melakukan redeem',
      data: {
        nik: employee.nik,
        nama: employee.nama,
        departemen: employee.departemen,
      },
    });
  } catch (error) {
    console.error('Validate API Error:', error);

    return Response.json(
      {
        success: false,
        message: 'Gagal memvalidasi NIK',
        error: error.message,
      },
      { status: 500 }
    );
  }
}