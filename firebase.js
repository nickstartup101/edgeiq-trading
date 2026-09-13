// Import Firebase SDK ແບບ Modular ຜ່ານ CDN (ໃຊ້ກັບ Firebase Hosting ໄດ້ທັນທີ 100%)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// Firebase Configuration ຂອງເຈົ້າ
const firebaseConfig = {
  apiKey: "AIzaSyDI2Gk1In4oLPmNQoVv39QvlkCCcQ_G20E",
  authDomain: "trading-journal-c6e14.firebaseapp.com",
  projectId: "trading-journal-c6e14",
  storageBucket: "trading-journal-c6e14.firebasestorage.app",
  messagingSenderId: "563957081798",
  appId: "1:563957081798:web:2e639b2bd2e68e1f8c99c7",
  measurementId: "G-LQ7V08P4MQ"
};

// ເລີ່ມຕົ້ນລະບົບ Firebase, Firestore ແລະ Storage
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const TRADES_COLLECTION = "trades";

/**
 * 1. ຟັງຊັນດຶງຂໍ້ມູນການເທຣດທັງໝົດມາສະແດງໃນ Journal & Dashboard
 */
export async function getTradesFromFirestore() {
  try {
    const q = query(
      collection(db, TRADES_COLLECTION), 
      orderBy("created_at", "desc")
    );
    const querySnapshot = await getDocs(q);
    const trades = [];
    querySnapshot.forEach((doc) => {
      trades.push({ id: doc.id, ...doc.data() });
    });
    return trades;
  } catch (error) {
    console.error("❌ ເກີດຂໍ້ຜິດພາດໃນການດຶງຂໍ້ມູນ:", error);
    return [];
  }
}

/**
 * 2. ຟັງຊັນບັນທຶກ Trade ໃໝ່ລົງ Firestore
 */
export async function saveTradeToFirestore(tradeData) {
  try {
    const docRef = await addDoc(collection(db, TRADES_COLLECTION), {
      ...tradeData,
      created_at: serverTimestamp() // ບັນທຶກເວລາ Server ອັດຕະໂນມັດ
    });
    console.log("✅ ບັນທຶກລົງ Firestore ສຳເລັດ ID:", docRef.id);
    return { id: docRef.id, ...tradeData };
  } catch (error) {
    console.error("❌ ເກີດຂໍ້ຜິດພາດໃນການບັນທຶກ:", error);
    throw error;
  }
}

/**
 * 3. ຟັງຊັນອັບໂຫຼດຮູບກຣາຟ (Screenshots) ເຂົ້າ Storage
 */
export async function uploadScreenshot(file, folder = "charts") {
  if (!file) return null;
  try {
    const fileRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error("❌ ອັບໂຫຼດຮູບບໍ່ສຳເລັດ:", error);
    return null;
  }
}
