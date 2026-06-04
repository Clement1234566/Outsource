import { getConnection } from '@/lib/db';

export async function POST(request) {
  const connection = await getConnection();

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

    await connection.beginTransaction();

    try {
      // Cari data employee
      const [employees] = await connection.execute(
        `
        SELECT id, nama, departemen, nik
        FROM employees
        WHERE UPPER(TRIM(nik)) = ?
        FOR UPDATE
        `,
        [inputNik]
      );

      if (employees.length === 0) {
        await connection.rollback();

        return Response.json(
          {
            success: false,
            message: 'NIK tidak terdaftar',
          },
          { status: 404 }
        );
      }

      const employee = employees[0];

      // Cek apakah sudah pernah redeem
      const [redeemCheck] = await connection.execute(
        `
        SELECT id
        FROM redeem_history
        WHERE UPPER(TRIM(nik)) = ?
        FOR UPDATE
        `,
        [employee.nik.trim().toUpperCase()]
      );

      if (redeemCheck.length > 0) {
        await connection.rollback();

        return Response.json(
          {
            success: false,
            message: 'NIK ini sudah pernah melakukan redeem',
          },
          { status: 403 }
        );
      }

      // Ambil hadiah yang masih tersedia
      const [prizes] = await connection.execute(
        `
        SELECT id, name, qty
        FROM prizes
        WHERE qty > 0
        ORDER BY RAND()
        LIMIT 1
        `
      );

      if (prizes.length === 0) {
        await connection.rollback();

        return Response.json(
          {
            success: false,
            message: 'Tidak ada hadiah tersedia',
          },
          { status: 500 }
        );
      }

      const selectedPrize = prizes[0];

      // Simpan history redeem
      await connection.execute(
        `
        INSERT INTO redeem_history
        (
          nik,
          employee_name,
          departemen,
          prize_id,
          prize_name
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          employee.nik,
          employee.nama,
          employee.departemen,
          selectedPrize.id,
          selectedPrize.name,
        ]
      );

      // Kurangi stok hadiah
      await connection.execute(
        `
        UPDATE prizes
        SET qty = qty - 1
        WHERE id = ?
        `,
        [selectedPrize.id]
      );

      await connection.commit();

      return Response.json({
        success: true,
        message: 'Redeem berhasil!',
        data: {
          nik: employee.nik,
          nama: employee.nama,
          departemen: employee.departemen,
          prize_id: selectedPrize.id,
          prize_name: selectedPrize.name,
          redeemed_at: new Date().toISOString(),
        },
      });
    } catch (transactionError) {
      await connection.rollback();
      throw transactionError;
    }
  } catch (error) {
    console.error('Redeem API Error:', error);

    return Response.json(
      {
        success: false,
        message: 'Gagal memproses redeem',
        error: error.message,
      },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}