// ໃສ່ຂໍ້ມູນໂຄງການ Supabase ຂອງທ່ານທີ່ນີ້
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';

// Init Client ຈາກ CDN
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ຟັງຊັນດຶງຂໍ້ມູນ Trades ທັງໝົດ
async function getTradesFromDB() {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching trades:', error.message);
    return [];
  }
  return data;
}

// ຟັງຊັນບັນທຶກ Trade ໃໝ່
async function saveTradeToDB(tradeData) {
  const { data, error } = await supabase
    .from('trades')
    .insert([tradeData])
    .select();

  if (error) {
    console.error('Error inserting trade:', error.message);
    throw error;
  }
  return data[0];
}

// ຟັງຊັນອັບໂຫຼດຮູບພາບເຂົ້າ Storage Bucket 'trade-charts'
async function uploadScreenshot(file, path) {
  const { data, error } = await supabase.storage
    .from('trade-charts')
    .upload(path, file);

  if (error) {
    console.error('Upload Error:', error.message);
    return null;
  }

  const { data: publicUrl } = supabase.storage
    .from('trade-charts')
    .getPublicUrl(path);

  return publicUrl.publicUrl;
}
