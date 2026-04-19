
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { geminiService } from '../services/geminiService';
import { Icons } from '../constants';
import { db } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { handleFirestoreError } from '../App';
import { MoveTask, OperationType } from '../types';

// Helper functions for Audio
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

interface AILabProps {
  user: {
    workerId?: string;
    role: 'admin' | 'user';
  };
  showToast: (message: string) => void;
}

const AILab: React.FC<AILabProps> = ({ user, showToast }) => {
  const [activeTool, setActiveTool] = useState<'thinking' | 'fast_chat' | 'vision' | 'generation' | 'maps' | 'edit' | 'seed' | 'story' | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const aspectRatios = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];

  // --- AUDIO RECORDING FOR TRANSCRIPTION (Gemini 3 Flash) ---
  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        if (isMounted.current) await processAudioForTranscription(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Nelze přistoupit k mikrofonu.");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // --- NATIVE SPEECH RECOGNITION (STT) for Czech ---
  const startNativeSTT = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Rozpoznávání řeči není v tomto prohlížeči podporováno.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'cs-CZ';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);
    
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((res: any) => res[0].transcript)
        .join('');
      if (event.results[0].isFinal && isMounted.current) {
        setInput(prev => (prev ? `${prev} ${transcript}` : transcript));
      }
    };

    recognition.start();
  };

  const handleSTTClick = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      // Prefer Native STT for speed and interim results, fallback to Gemini Transcription
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        startNativeSTT();
      } else {
        handleStartRecording();
      }
    }
  };

  const processAudioForTranscription = async (audioBlob: Blob) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64Audio = (reader.result as string).split(',')[1];
        // Send to Gemini 3 Flash Preview for transcription
        const text = await geminiService.transcribeAudio(base64Audio, "audio/wav");
        if (isMounted.current) setInput(prev => (prev ? `${prev} ${text}` : text));
      } catch (e: any) {
        const isAbort = e.name === 'AbortError' || e.message?.toLowerCase().includes('aborted');
        if (!isAbort && isMounted.current) console.error("Transcription error:", e);
      } finally {
        if (isMounted.current) setLoading(false);
      }
    };
    reader.readAsDataURL(audioBlob);
  };

  // --- TTS PLAYBACK (Gemini 2.5 Flash TTS) ---
  const playTTS = async (text: string) => {
    try {
      const base64PCM = await geminiService.generateSpeech(text);
      if (base64PCM) {
         const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
         const outputNode = outputAudioContext.createGain();
         outputNode.connect(outputAudioContext.destination);

         const audioBuffer = await decodeAudioData(
            decode(base64PCM),
            outputAudioContext,
            24000,
            1
         );
         
         const source = outputAudioContext.createBufferSource();
         source.buffer = audioBuffer;
         source.connect(outputNode);
         source.start();
      }
    } catch (e) {
      console.error("TTS Error:", e);
      alert("Chyba při přehrávání zvuku.");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const getCurrentLocation = (): Promise<{lat: number, lng: number} | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  };

  const isRunDisabled = useMemo(() => {
    if (loading || isRecording) return true;
    switch (activeTool) {
        case 'thinking':
        case 'fast_chat':
        case 'maps':
        case 'generation':
        case 'story':
            return !input;
        case 'vision':
            return !selectedImage;
        case 'edit':
            return !selectedImage || !input;
        default:
            return true;
    }
  }, [loading, activeTool, input, selectedImage, isRecording]);

  const runTool = async () => {
    setLoading(true);
    setResult(null);
    try {
      if (activeTool === 'seed') {
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);

        const task1: Omit<MoveTask, 'id'> = {
          title: "Stěhování: Praha -> Brno (Expres)",
          customer: "Jan Novák",
          customerPhone: "+420 777 123 456",
          start: new Date(today.setHours(10, 0, 0, 0)),
          end: new Date(today.setHours(14, 0, 0, 0)),
          from: "Václavské náměstí 1, Praha",
          to: "Náměstí Svobody 1, Brno",
          assignedWorkers: user.workerId ? [user.workerId] : [],
          assignedVehicles: [],
          status: 'Confirmed',
          type: 'Byt 2+kk',
          priority: 'High',
          notes: "Pozor na klavír v 2. patře."
        };

        const task2: Omit<MoveTask, 'id'> = {
          title: "Převoz nábytku: IKEA Černý Most",
          customer: "Marie Svobodová",
          customerPhone: "+420 602 987 654",
          start: new Date(tomorrow.setHours(9, 0, 0, 0)),
          end: new Date(tomorrow.setHours(11, 0, 0, 0)),
          from: "IKEA Černý Most, Praha",
          to: "Sokolovská 123, Praha",
          assignedWorkers: user.workerId ? [user.workerId] : [],
          assignedVehicles: [],
          status: 'Pending',
          type: 'Drobný převoz',
          priority: 'Medium',
          notes: "Vyzvednout u rampy č. 5."
        };

        await addDoc(collection(db, 'tasks'), task1);
        await addDoc(collection(db, 'tasks'), task2);
        showToast("Testovací data vytvořena");
        if (isMounted.current) setResult("Fiktivní zakázky byly úspěšně vytvořeny a přiřazeny k vašemu profilu.");
      } else if (activeTool === 'fast_chat') {
        const res = await geminiService.chatFast(input);
        if (isMounted.current) setResult(res);
      } else if (activeTool === 'story') {
        const res = await geminiService.generateStory(input);
        if (isMounted.current) setResult(res);
      } else if (activeTool === 'thinking') {
        if (isMounted.current) setResult(""); // Initialize empty result for streaming
        const res = await geminiService.thinkComplex(input, (chunk) => {
          if (isMounted.current) setResult((prev: any) => (typeof prev === 'string' ? prev + chunk : chunk));
        });
        if (isMounted.current) setResult(res);
      } else if (activeTool === 'vision' && selectedImage) {
        const mimeType = selectedImage.substring(selectedImage.indexOf(':') + 1, selectedImage.indexOf(';'));
        const base64 = selectedImage.split(',')[1];
        const res = await geminiService.analyzeImage(input || "Co vidíš na této fotce v kontextu stěhování? Popiš to česky.", base64, mimeType);
        if (isMounted.current) setResult(res);
      } else if (activeTool === 'edit' && selectedImage) {
        const mimeType = selectedImage.substring(selectedImage.indexOf(':') + 1, selectedImage.indexOf(';'));
        const base64 = selectedImage.split(',')[1];
        const res = await geminiService.editImage(input, base64, mimeType);
        if (isMounted.current) setResult(res);
      } else if (activeTool === 'generation') {
        const res = await geminiService.generateImage(input, '1K', aspectRatio);
        if (isMounted.current) setResult(res);
      } else if (activeTool === 'maps') {
        const loc = await getCurrentLocation();
        const res = await geminiService.getMapsInfo(input, loc?.lat, loc?.lng);
        if (isMounted.current) setResult(res);
      }
    } catch (e: any) {
        const isAbort = e.name === 'AbortError' || e.message?.toLowerCase().includes('aborted');
        if (!isAbort && isMounted.current) console.error(e);
        
        if (isMounted.current) {
          if (isAbort) {
               setResult("Požadavek byl přerušen (např. kvůli nestabilnímu připojení). Zkuste to prosím znovu.");
          } else if (e.message?.includes("API key not valid")) {
               setResult("Váš API klíč není platný. Prosím, obnovte stránku a vyberte platný klíč z placeného projektu.");
          } else {
               setResult("Omlouváme se, AI služba je momentálně přetížena nebo došlo k chybě.");
          }
        }
    }
    if (isMounted.current) setLoading(false);
  };

  const reset = () => { setActiveTool(null); setResult(null); setInput(''); setSelectedImage(null); };

  if (!activeTool) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-6"
      >
        <h2 className="text-xl font-black text-white tracking-tighter uppercase">Gemini <span className="text-blue-400">AI</span> Laboratoř</h2>
        <div className="grid grid-cols-2 gap-4">
          <ToolCard title="Rychlý Chat" desc="Flash Lite odpovědi." icon={<Icons.Zap />} onClick={() => setActiveTool('fast_chat')} />
          <ToolCard title="Plánovač" desc="Hloubkové plánování." icon={<Icons.Sparkles />} onClick={() => setActiveTool('thinking')} />
          <ToolCard title="Vizuální Analýza" desc="Odhad objemu z foto." icon={<Icons.Camera />} onClick={() => setActiveTool('vision')} />
          <ToolCard title="Testovací Data" desc="Vytvořit 2 mise." icon={<Icons.Plus />} onClick={() => setActiveTool('seed')} />
        </div>
      </motion.div>
    );
  }

  if (activeTool === 'seed') {
    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-6"
      >
        <div className="flex items-center gap-3">
          <button onClick={reset} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <h2 className="text-lg font-black text-white uppercase tracking-tight">Generátor Testovacích Dat</h2>
        </div>
        <div className="bg-slate-800 rounded-[32px] p-8 shadow-xl border border-slate-700 text-center space-y-6">
          <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center text-blue-400 mx-auto">
            <Icons.Plus className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-white uppercase">Vytvořit fiktivní zakázky?</h3>
            <p className="text-sm text-slate-400">Tato akce vytvoří 2 vzorové zakázky (jednu na dnes a jednu na zítra) a přiřadí je přímo k vašemu profilu.</p>
          </div>
          <button 
            onClick={runTool}
            disabled={loading}
            className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 disabled:opacity-30 transition-all active:scale-95"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Potvrdit a vytvořit"}
          </button>
        </div>
        {result && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-green-600/10 border border-green-500/20 p-6 rounded-[32px] text-center"
          >
            <p className="text-green-400 text-sm font-bold">{result}</p>
          </motion.div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <button onClick={reset} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <h2 className="text-lg font-black text-white uppercase tracking-tight">
          {activeTool === 'fast_chat' ? 'Rychlý Asistent' :
           activeTool === 'thinking' ? 'Strategický Plánovač' : 
           activeTool === 'vision' ? 'Vizuální Analýza' : 
           activeTool === 'generation' ? 'AI Designér' : 
           activeTool === 'edit' ? 'AI Editor Obrázků' :
           activeTool === 'story' ? 'Kreativní Psaní' :
           'Průzkumník Trasy'}
        </h2>
      </div>

      <div className="bg-slate-800 rounded-[32px] p-6 shadow-xl border border-slate-700 space-y-4">
        {(activeTool === 'vision' || activeTool === 'edit') && (
          <div onClick={() => fileInputRef.current?.click()} className="aspect-video bg-slate-900 rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer overflow-hidden mb-4 group hover:border-blue-500 transition-all">
            {selectedImage ? (
              <img src={selectedImage} className="w-full h-full object-cover" />
            ) : (
              <div className="text-slate-600 text-center p-4">
                <Icons.Camera />
                <p className="text-[10px] font-black mt-2 uppercase">Klikni pro nahrání nebo vyfocení</p>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              hidden 
              accept="image/*" 
              capture="environment"
              onChange={handleImageUpload} 
            />
          </div>
        )}
        
        {activeTool === 'generation' && (
          <div className="space-y-3 mb-4">
            <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest flex items-center gap-2">
              <Icons.AspectRatio />
              Poměr stran
            </label>
            <div className="flex flex-wrap gap-2">
              {aspectRatios.map(ratio => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all border ${aspectRatio === ratio ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          <textarea 
            placeholder={
              activeTool === 'fast_chat' ? "Zeptejte se na cokoliv ohledně stěhování (např. jak zabalit křehké sklo?)..." :
              activeTool === 'thinking' ? "Popište složitý logistický problém pro hloubkovou analýzu..." : 
              activeTool === 'vision' ? "Popište, co chcete na nahrané fotce analyzovat (např. odhadni objem věcí)..." : 
              activeTool === 'maps' ? "Hledáte něco v okolí? (např. nejbližší stavebniny, čerpací stanice)..." :
              activeTool === 'edit' ? "Popište úpravu, kterou má AI na fotce provést (např. změň barvu auta)..." :
              activeTool === 'story' ? "Zadejte téma pro kreativní příběh..." :
              "Popište detailně, co má AI vygenerovat..."
            }
            value={input}
            onChange={e => setInput(e.target.value)}
            className="w-full bg-slate-900 border-none rounded-2xl p-5 pr-14 min-h-[140px] focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-100 placeholder-slate-600"
          />
          <button 
            onClick={handleSTTClick}
            className={`absolute right-4 top-4 p-3 rounded-xl transition-all ${isRecording ? 'bg-red-600 text-white animate-pulse shadow-[0_0_15px_#dc2626]' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
            title={isRecording ? "Zastavit diktování" : "Diktovat česky"}
          >
             {isRecording ? <Icons.StopCircle /> : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
                </svg>
             )}
          </button>
        </div>

        <button 
          onClick={runTool}
          disabled={isRunDisabled}
          className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 disabled:opacity-30 transition-all"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <><Icons.Sparkles /> {activeTool === 'maps' ? 'Vyhledat v mapách' : 'Spustit AI'}</>
          )}
        </button>
      </div>
      
      {result && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-600/10 border border-blue-500/20 p-6 rounded-[32px] overflow-hidden relative group"
        >
          {typeof result === 'string' && result.startsWith('data:') ? (
            <img src={result} className="w-full rounded-xl shadow-2xl" />
          ) : typeof result === 'object' && result.text ? (
             <div className="space-y-4">
               <p className="text-blue-100 text-sm leading-relaxed whitespace-pre-wrap">{result.text}</p>
               {result.links?.map((l:any, i:number) => (
                 <a key={i} href={l.maps?.uri} target="_blank" className="flex items-center justify-between bg-slate-900 p-3 rounded-xl text-[10px] font-black text-blue-400 hover:bg-slate-800 transition-colors">
                   {l.maps?.title || "ZOBRAZIT MÍSTO"} <Icons.ChevronRight />
                 </a>
               ))}
               <div className="flex justify-end pt-2">
                    <button onClick={() => playTTS(result.text)} className="p-2 bg-blue-600 rounded-full text-white shadow-lg hover:bg-blue-500 transition-colors" title="Přečíst nahlas">
                        <Icons.Speaker />
                    </button>
               </div>
             </div>
          ) : (
            <div className="space-y-3">
                <p className="text-blue-100 text-sm leading-relaxed whitespace-pre-wrap">{result}</p>
                <div className="flex justify-end pt-2">
                    <button onClick={() => playTTS(result)} className="p-2 bg-blue-600 rounded-full text-white shadow-lg hover:bg-blue-500 transition-colors" title="Přečíst nahlas">
                        <Icons.Speaker />
                    </button>
               </div>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};

const ToolCard = ({ title, desc, icon, onClick }: { title: string, desc: string, icon: React.ReactNode, onClick: () => void }) => (
  <button onClick={onClick} className="w-full bg-slate-800 p-6 rounded-[28px] text-left border border-slate-700 shadow-sm hover:bg-slate-750 hover:border-blue-500/30 transition-all group h-full flex flex-col justify-between">
    <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center text-blue-400 mb-4 group-hover:scale-110 group-hover:text-white transition-all">{icon}</div>
    <div>
        <h3 className="font-black text-slate-100 text-sm mb-1 uppercase tracking-tight">{title}</h3>
        <p className="text-[10px] text-slate-500 font-bold leading-tight">{desc}</p>
    </div>
  </button>
);

export default AILab;
