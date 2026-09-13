// Import Firebase SDK ແບບ Modular ຜ່ານ CDN (ບໍ່ຕ້ອງຕິດຕັ້ງ npm)
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

// Firebase Config ຂອງທ່ານ
const firebaseConfig = {
  apiKey: "AIzaSyDI2Gk1In4oLPmNQoVv39QvlkCCcQ_G20E",
  authDomain: "trading-journal-c6e14.firebaseapp.com",
  projectId: "trading-journal-c6e14",
  storageBucket: "trading-journal-c6e14.firebasestorage.app",
  messagingSenderId: "563957081798",
  appId: "1:563957081798:web:2e639b2bd2e68e1f8c99c7",
  measurementId: "G-LQ7V08P4MQ"
};

// Initialize Firebase & Services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const TRADES_COLLECTION = "trades";

/**
 * ດຶງຂໍ້ມູນ Trades ທັງໝົດ ຈັດລຽງຕາມເວລາລ່າສຸດ
 */
export async function getTradesFromFirestore() {
  try {
    const q = query(collection(db, TRADES_COLLECTION), orderBy("created_at", "desc"));
    const querySnapshot = await getDocs(q);
    const trades = [];
    querySnapshot.forEach((doc) => {
      trades.push({ id: doc.id, ...doc.data() });
    });
    return trades;
  } catch (error) {
    console.error("Error loading trades:", error);
    return [];
  }
}

/**
 * ບັນທຶກ Trade ໃໝ່ລົງ Firestore
 */
export async function saveTradeToFirestore(tradeData) {
  try {
    const docRef = await addDoc(collection(db, TRADES_COLLECTION), {
      ...tradeData,
      created_at: serverTimestamp()
    });
    return { id: docRef.id, ...tradeData };
  } catch (error) {
    console.error("Error saving trade:", error);
    throw error;
  }
}

/**
 * ອັບໂຫຼດຮູບ Screenshot ເຂົ້າ Firebase Storage
 */
export async function uploadScreenshot(file, folder = "charts") {
  if (!file) return null;
  try {
    const fileRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(fileRef, file);
    return await getDownloadURL(snapshot.ref);
  } catch (error) {
    console.error("Storage Upload Error:", error);
    return null;
  }
}
