import { db } from "./firebase.js";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const btn = document.getElementById("btn-test");
const statusText = document.getElementById("status");

btn.addEventListener("click", async () => {
  statusText.textContent = "Status: Mengirim data...";
  try {
    const docRef = await addDoc(collection(db, "tes_koneksi"), {
      pesan: "Berhasil terhubung dari Netlify!",
      waktu: serverTimestamp(),
    });
    statusText.textContent = `Status: SUKSES! ID Dokumen: ${docRef.id}`;
  } catch (error) {
    statusText.textContent = `Status: GAGAL (${error.message})`;
  }
});
