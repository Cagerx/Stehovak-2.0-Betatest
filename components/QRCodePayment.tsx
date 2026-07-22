import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Icons } from '../constants';

interface QRCodePaymentProps {
  isAdmin: boolean;
  showToast: (msg: string) => void;
}

const QRCodePayment: React.FC<QRCodePaymentProps> = ({ isAdmin, showToast }) => {
  const [amount, setAmount] = useState<number>(500);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Generate options from 500 to 20000 with step 500
  const options = Array.from({ length: 40 }, (_, i) => (i + 1) * 500);

  useEffect(() => {
    const fetchQRCodes = async () => {
      try {
        const docRef = doc(db, 'settings', 'qrcodes');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setQrCodes(docSnap.data() as Record<string, string>);
        }
      } catch (error) {
        console.error("Failed to fetch QR codes", error);
      } finally {
        setLoading(false);
      }
    };
    fetchQRCodes();
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      const updatedCodes = { ...qrCodes, [amount.toString()]: base64String };
      setQrCodes(updatedCodes);
      
      try {
        await setDoc(doc(db, 'settings', 'qrcodes'), updatedCodes);
        showToast(`QR kód pro ${amount} Kč uložen.`);
      } catch (error) {
        console.error("Error saving QR code", error);
        alert("Chyba při ukládání QR kódu.");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteQR = async () => {
    if (!confirm(`Opravdu chcete smazat QR kód pro ${amount} Kč?`)) return;
    
    const updatedCodes = { ...qrCodes };
    delete updatedCodes[amount.toString()];
    setQrCodes(updatedCodes);
    
    try {
      await setDoc(doc(db, 'settings', 'qrcodes'), updatedCodes);
      showToast(`QR kód pro ${amount} Kč smazán.`);
    } catch (error) {
      console.error("Error deleting QR code", error);
      alert("Chyba při mazání QR kódu.");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const currentQR = qrCodes[amount.toString()];

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">
          Vyberte částku k platbě
        </label>
        <select 
          value={amount} 
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full bg-slate-900 rounded-2xl p-4 text-white border-none font-black outline-none appearance-none text-xl text-center shadow-inner focus:ring-2 ring-blue-500/50"
        >
          {options.map(opt => (
            <option key={opt} value={opt}>{opt.toLocaleString()} Kč</option>
          ))}
        </select>
      </div>

      <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col items-center justify-center min-h-[300px] relative">
        {currentQR ? (
          <div className="bg-white p-4 rounded-2xl">
            <img src={currentQR} alt={`QR kód ${amount} Kč`} className="max-w-full max-h-[250px] object-contain" />
          </div>
        ) : (
          <div className="text-center p-8 border-2 border-dashed border-slate-700 rounded-3xl w-full">
            <Icons.ImageEdit className="w-12 h-12 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">
              Pro tuto částku není nahrán žádný QR kód
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="mt-6 flex gap-3 w-full">
            <label className="flex-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 font-black py-3 rounded-xl uppercase text-[10px] tracking-widest text-center cursor-pointer hover:bg-blue-600 hover:text-white transition-all">
              {currentQR ? 'Změnit QR' : 'Nahrát QR'}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            {currentQR && (
              <button 
                onClick={handleDeleteQR}
                className="flex-[0.5] bg-red-600/20 text-red-500 border border-red-500/30 font-black py-3 rounded-xl uppercase text-[10px] tracking-widest hover:bg-red-600 hover:text-white transition-all"
              >
                Smazat
              </button>
            )}
          </div>
        )}
      </div>
      
      <p className="text-[9px] text-slate-500 text-center font-bold px-4 leading-relaxed uppercase tracking-widest">
        Zvolte částku a ukažte QR kód zákazníkovi k platbě.
      </p>
    </div>
  );
};

export default QRCodePayment;
