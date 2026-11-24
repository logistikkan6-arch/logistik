# GudangSembako Cloud Pro

Aplikasi operasional gudang dengan stok bersama, akun berbasis undangan, serta riwayat mutasi yang mencatat petugas. Data disimpan di Netlify Database. Aplikasi dimulai dengan gudang kosong, tanpa akun atau data contoh bawaan.

## Memulai

1. Buka aplikasi pada deploy Netlify yang menyertakan migrasi database dan aktivasi Identity.
2. Open Manage and search for 'Identity'.
3. Akun gudang membutuhkan peran `admin` atau `operator`. `admin` mengelola master barang, lokasi, jenis aset, opname, dan pembatalan pesanan. `operator` dapat mencatat transaksi, merealisasi pesanan, mencatat mutasi aset, dan melihat data gudang. Akun tanpa salah satu peran tidak dapat mengakses data.
4. Masuk sebagai admin, tambahkan lokasi dan master barang, lalu catat saldo awal sebagai barang masuk. Gunakan satuan yang konsisten per SKU dan kuantitas bilangan bulat.

## Alur kerja

- Catat barang masuk dan keluar berdasarkan lokasi. Barcode lokasi bisa dipindai melalui kamera atau dimasukkan manual. Lokasi yang kodenya diubah memerlukan label cetak baru.
- Saat lot tidak ditentukan, barang keluar mengikuti FEFO dan tidak memakai lot yang sudah kedaluwarsa. Opname menetapkan saldo fisik satu lot; catatan alasan wajib.
- Pesanan tertunda belum mengubah saldo. Saat direalisasi, perubahan saldo dan penutupan pesanan dicatat dalam satu transaksi database.
- Gunakan contoh CSV di menu Persediaan untuk impor master (maksimal 500 barang per file). SKU yang sudah ada tidak ditimpa. CSV ini bukan impor saldo awal atau riwayat transaksi Firebase.
- Gunakan Kartu Stok dan Laporan untuk memeriksa riwayat, mengekspor data, dan meninjau saran pemesanan ulang.

## Pengembangan

Gunakan Node.js 24. `npm run dev` membuka antarmuka Vite. Login dengan akun sungguhan memerlukan deploy Netlify yang telah mengaktifkan Identity. Jika skema di `db/schema.ts` berubah, buat migrasi dengan `npx drizzle-kit generate --name <nama_migrasi>` dan sertakan hasilnya dalam perubahan berikutnya.
